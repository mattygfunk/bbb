'use strict';

const crypto = require('crypto');

// ── AFL Constants ─────────────────────────────────────────────────────────────

const AFL_TEAMS = [
  'Adelaide', 'Brisbane Lions', 'Carlton', 'Collingwood', 'Essendon',
  'Fremantle', 'Geelong', 'Gold Coast Suns', 'GWS Giants', 'Hawthorn',
  'Melbourne', 'North Melbourne', 'Port Adelaide', 'Richmond', 'St Kilda',
  'Sydney Swans', 'West Coast Eagles', 'Western Bulldogs'
];

const AFL_TEAM_ABBR = {
  'Adelaide': 'ADE', 'Brisbane Lions': 'BRL', 'Carlton': 'CAR',
  'Collingwood': 'COL', 'Essendon': 'ESS', 'Fremantle': 'FRE',
  'Geelong': 'GEE', 'Gold Coast Suns': 'GCS', 'GWS Giants': 'GWS',
  'Hawthorn': 'HAW', 'Melbourne': 'MEL', 'North Melbourne': 'NME',
  'Port Adelaide': 'PAD', 'Richmond': 'RIC', 'St Kilda': 'STK',
  'Sydney Swans': 'SYD', 'West Coast Eagles': 'WCE', 'Western Bulldogs': 'WBD'
};

// ── Toolbox helpers ───────────────────────────────────────────────────────────

/**
 * Ensure an entry has a season-scoped Toolbox with 2 Double Points tokens.
 * Idempotent: never overwrites an already-granted toolbox for the same season.
 */
function ensureToolbox(entry, seasonYear) {
  const year = seasonYear || new Date().getFullYear();
  if (!entry.toolbox || entry.toolbox.season !== year) {
    entry.toolbox = {
      season: year,
      doublePointsRemaining: 1,
      doublePointsActiveRounds: []
    };
  } else {
    // Ensure sub-fields exist (forward compat)
    if (typeof entry.toolbox.doublePointsRemaining !== 'number') {
      entry.toolbox.doublePointsRemaining = 1;
    }
    if (!Array.isArray(entry.toolbox.doublePointsActiveRounds)) {
      entry.toolbox.doublePointsActiveRounds = [];
    }
  }
  return entry.toolbox;
}

/**
 * Process KO eliminations based on first game of a round
 */
function processKnockoutEliminations(store, roundId) {
  const at = ensureAflStore(store);
  const round = at.rounds.find((r) => r.id === roundId);
  if (!round || round.status !== 'scored' || !round.games.length) return;

  const results = [];

  for (const ko of at.knockout) {
    // Skip if KO already completed
    if (ko.status === 'completed') {
      results.push({ id: ko.id, name: ko.name, status: 'completed' });
      continue;
    }

    // Determine which game to use for elimination (1st game for KO 1, 2nd game for KO 2)
    const gameIndex = ko.id === 1 ? 0 : 1;
    const koGame = round.games[gameIndex];
    if (!koGame || !koGame.result || !koGame.result.winner) {
      results.push({ id: ko.id, name: ko.name, status: 'skipped' });
      continue;
    }

    const correctPick = koGame.result.winner;
    const roundLabel = round.label || 'Round';

    // Skip if this KO comp hasn't started yet (startRound not reached)
    if (ko.status === 'pending' && ko.startRound && round.number < ko.startRound) {
      results.push({ id: ko.id, name: ko.name, status: 'pending', reason: `Starts round ${ko.startRound}` });
      continue;
    }

    // Initialize active players from confirmed entries if it's the first round of eliminations
    if (ko.status === 'pending') {
      const confirmedEntries = at.entries.filter((e) => e.status === 'confirmed');
      ko.activePlayers = confirmedEntries.map((e) => e.userId);
      ko.status = 'active';
    }

    const newEliminations = [];
    const remainingPlayers = [];

    for (const userId of ko.activePlayers) {
      const userTips = round.tips[userId] || [];
      const gameTip = userTips.find((tip) => tip.gameId === koGame.id);
      
      if (!gameTip || gameTip.pick !== correctPick) {
        // Player is eliminated
        const entry = at.entries.find((e) => e.userId === userId);
        newEliminations.push({
          userId,
          member: entry ? entry.member : 'Unknown',
          roundId,
          roundLabel,
          eliminatedAt: Date.now(),
          incorrectPick: gameTip ? gameTip.pick : null,
          correctPick
        });
      } else {
        // Player survives
        remainingPlayers.push(userId);
      }
    }

    // Update knockout state
    ko.eliminated.push(...newEliminations);
    ko.activePlayers = remainingPlayers;

    // Check for a winner
    if (remainingPlayers.length === 1) {
      const winnerId = remainingPlayers[0];
      const winnerEntry = at.entries.find((e) => e.userId === winnerId);
      const prizes = calcSeasonPrizes(store);
      
      ko.winner = {
        userId: winnerId,
        member: winnerEntry ? winnerEntry.member : 'Unknown',
        wonAt: Date.now(),
        prize: prizes.knockoutEach
      };
      ko.status = 'completed';
    } else if (remainingPlayers.length === 0) {
      // No survivors
      ko.status = 'completed';
    }
    
    results.push({ 
      id: ko.id,
      name: ko.name,
      eliminated: newEliminations.length,
      remaining: remainingPlayers.length,
      winner: ko.winner 
    });
  }
  
  return results;
}

// ── Store bootstrap ───────────────────────────────────────────────────────────

function ensureAflStore(store) {
  if (!store.aflTipping || typeof store.aflTipping !== 'object') {
    store.aflTipping = {
      season: {
        id: crypto.randomUUID(),
        name: '2026 AFL Season',
        year: 2026,
        entryFee: 100,
        weeklyPrizePerUser: 1,
        status: 'open',
        prizeStructure: { 
          seasonLeaderboard: 0.695, // 69.5%
          knockout: 0.075,          // 7.5%
          weeklyPot: 0.23,           // 23%
          leaderboardPayout: { first: 0.50, second: 0.30, third: 0.20 } 
        },
        createdAt: Date.now()
      },
      rounds: [],
      entries: [],
      paymentAudit: [],
      payoutAudit: [],
      weeklyRollover: 0,
      analytics: { weeklyEngagement: [] },
      knockout: [
        { id: 1, name: "KO Comp 1", startRound: 1,  status: 'pending', activePlayers: [], eliminated: [], winner: null },
        { id: 2, name: "KO Comp 2", startRound: 13, status: 'pending', activePlayers: [], eliminated: [], winner: null }
      ]
    };
  }
  const at = store.aflTipping;
  if (!Array.isArray(at.rounds)) at.rounds = [];
  if (!Array.isArray(at.entries)) at.entries = [];
  if (!Array.isArray(at.paymentAudit)) at.paymentAudit = [];
  if (!Array.isArray(at.payoutAudit)) at.payoutAudit = [];
  if (typeof at.weeklyRollover !== 'number') at.weeklyRollover = 0;
  if (!at.analytics || typeof at.analytics !== 'object') at.analytics = { weeklyEngagement: [] };
  if (!Array.isArray(at.analytics.weeklyEngagement)) at.analytics.weeklyEngagement = [];
  
  if (!Array.isArray(at.knockout) || at.knockout.length !== 2) {
    at.knockout = [
      { id: 1, name: "KO Comp 1", startRound: 1,  status: 'pending', activePlayers: [], eliminated: [], winner: null },
      { id: 2, name: "KO Comp 2", startRound: 13, status: 'pending', activePlayers: [], eliminated: [], winner: null }
    ];
  }
  
  return at;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreRound(store, roundId) {
  const at = ensureAflStore(store);
  const round = at.rounds.find((r) => r.id === roundId);
  if (!round) throw new Error('Round not found');

  const gamesWithResults = round.games.filter((g) => g.result && g.result.winner);
  if (!gamesWithResults.length) throw new Error('No game results set');

  const resultMap = {};
  for (const g of gamesWithResults) resultMap[g.id] = g.result.winner;

  const scores = {};
  const confirmedEntries = at.entries.filter((e) => e.status === 'confirmed');

  for (const entry of confirmedEntries) {
    const userId = entry.userId;
    const userTips = round.tips[userId] || [];
    let correct = 0;
    let total = 0;

    for (const tip of userTips) {
      if (!resultMap[tip.gameId]) continue; // game not yet scored
      total++;
      if (tip.pick === resultMap[tip.gameId]) correct++;
    }

    const perfect = total === gamesWithResults.length && correct === gamesWithResults.length;
    // +1 bonus for perfect round
    let points = correct + (perfect ? 1 : 0);

    // Double Points toolbox multiplier
    const tb = entry.toolbox || {};
    const dpActive = Array.isArray(tb.doublePointsActiveRounds) &&
      tb.doublePointsActiveRounds.includes(roundId);
    if (dpActive) points *= 2;

    // Margin tiebreaker (based on first game)
    let marginAccuracy = null;
    const firstGame = round.games[0];
    if (firstGame && firstGame.result && typeof firstGame.result.homeScore === 'number' && typeof firstGame.result.awayScore === 'number') {
      const actualMargin = Math.abs(firstGame.result.homeScore - firstGame.result.awayScore);
      const userMargin = round.margins && round.margins[userId] ? round.margins[userId].prediction : 0;
      marginAccuracy = Math.abs(actualMargin - userMargin); // Lower is better
    }

    scores[userId] = { 
      correct, 
      total, 
      perfect, 
      points, 
      member: entry.member, 
      doublePointsUsed: dpActive,
      marginAccuracy
    };

    // Consume the token once scoring is finalised (idempotent — only consume if still listed as remaining)
    if (dpActive && typeof tb.doublePointsRemaining === 'number' && tb.doublePointsRemaining > 0) {
      // Token was already deducted at activation time; no double-deduct here
    }
  }

  round.scores = scores;

  // Determine weekly jackpot winner (highest correct tips, outright only)
  const rankedUsers = Object.entries(scores)
    .sort((a, b) => b[1].correct - a[1].correct);

  let weeklyWinner = null;
  let rolledOver = false;
  let payout = null;

  const rolloverIn = at.weeklyRollover;
  const confirmedCount = at.entries.filter((e) => e.status === 'confirmed').length;
  const basePot = confirmedCount * (at.season.weeklyPrizePerUser || 1);
  const totalPot = basePot + rolloverIn;

  round.weeklyJackpot = round.weeklyJackpot || {};
  round.weeklyJackpot.basePot = basePot;
  round.weeklyJackpot.rolloverIn = rolloverIn;
  round.weeklyJackpot.totalPot = totalPot;
  round.weeklyJackpot.settledAt = Date.now();

  if (rankedUsers.length === 0) {
    // No entries — roll over
    at.weeklyRollover = totalPot;
    round.weeklyJackpot.rolledOver = true;
    round.weeklyJackpot.winnerId = null;
    round.weeklyJackpot.winnerMember = null;
    round.weeklyJackpot.winnerPayout = null;
    rolledOver = true;
  } else {
    const topScore = rankedUsers[0][1].correct;
    const topUsers = rankedUsers.filter(([, s]) => s.correct === topScore);

    if (topUsers.length > 1 || topScore === 0) {
      // Tie or zero correct — roll over
      at.weeklyRollover = totalPot;
      round.weeklyJackpot.rolledOver = true;
      round.weeklyJackpot.winnerId = null;
      round.weeklyJackpot.winnerMember = null;
      round.weeklyJackpot.winnerPayout = null;
      rolledOver = true;
    } else {
      // Outright winner
      const [winnerId, winnerScore] = topUsers[0];
      const winnerEntry = confirmedEntries.find((e) => e.userId === winnerId);
      weeklyWinner = { userId: winnerId, member: winnerScore.member, correct: winnerScore.correct };
      payout = totalPot;
      at.weeklyRollover = 0;
      round.weeklyJackpot.rolledOver = false;
      round.weeklyJackpot.winnerId = winnerId;
      round.weeklyJackpot.winnerMember = winnerScore.member;
      round.weeklyJackpot.winnerPayout = payout;
    }
  }

  round.status = 'scored';
  round.updatedAt = Date.now();

  // Track analytics
  at.analytics.weeklyEngagement.push({
    roundId,
    roundNumber: round.roundNumber,
    tipperCount: Object.keys(scores).length,
    scoredAt: Date.now()
  });

  // Process KO eliminations based on first game
  const koResult = processKnockoutEliminations(store, roundId);

  return { roundId, scores, weeklyWinner, payout, rolledOver, newRollover: at.weeklyRollover, knockout: koResult };
}

// ── Season leaderboard ────────────────────────────────────────────────────────

function buildSeasonLeaderboard(store) {
  const at = ensureAflStore(store);
  const scoredRounds = at.rounds.filter((r) => r.status === 'scored');

  const ladder = {};
  const confirmedEntries = at.entries.filter((e) => e.status === 'confirmed');
  const pendingEntries = at.entries.filter((e) => e.status === 'pending');
  const allEntries = [...confirmedEntries, ...pendingEntries];

  // Initialize ladder for all entries
  for (const entry of allEntries) {
    const tb = entry.toolbox || {};
    const dpRemaining = tb.doublePointsRemaining || 0;
    const dpUsed = 1 - dpRemaining; // Originally had 1, now has X remaining
    
    ladder[entry.userId] = {
      userId: entry.userId,
      member: entry.member,
      paid: entry.paid,
      status: entry.status,
      totalCorrect: 0,
      totalPoints: 0,
      roundsPlayed: 0,
      perfectRounds: 0,
      thisWeek: 0,
      doublePointsUsed: dpUsed > 0,
      doublePointsRemaining: dpRemaining
    };
  }

  const latestRound = scoredRounds[scoredRounds.length - 1];

  for (const round of scoredRounds) {
    for (const [userId, score] of Object.entries(round.scores || {})) {
      if (!ladder[userId]) {
        ladder[userId] = {
          userId,
          member: score.member || 'Unknown',
          paid: false,
          status: 'pending',
          totalCorrect: 0,
          totalPoints: 0,
          roundsPlayed: 0,
          perfectRounds: 0,
          thisWeek: 0,
          doublePointsUsed: false,
          doublePointsRemaining: 1
        };
      }
      ladder[userId].totalCorrect += score.correct || 0;
      ladder[userId].totalPoints += score.points || score.correct || 0;
      ladder[userId].roundsPlayed++;
      if (score.perfect) ladder[userId].perfectRounds++;
      if (latestRound && round.id === latestRound.id) {
        ladder[userId].thisWeek = score.correct || 0;
        // Store margin accuracy from latest round for tiebreaker
        if (typeof score.marginAccuracy === 'number') {
          ladder[userId].latestMarginAccuracy = score.marginAccuracy;
        }
      }
    }
  }

  return Object.values(ladder)
    .sort((a, b) => {
      // Primary: total points
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      
      // Secondary: total correct
      if (b.totalCorrect !== a.totalCorrect) return b.totalCorrect - a.totalCorrect;
      
      // Tiebreaker: latest round margin accuracy (lower is better)
      const aMargin = typeof a.latestMarginAccuracy === 'number' ? a.latestMarginAccuracy : 999;
      const bMargin = typeof b.latestMarginAccuracy === 'number' ? b.latestMarginAccuracy : 999;
      return aMargin - bMargin;
    });
}

// ── Season prize projections ──────────────────────────────────────────────────

function calcSeasonPrizes(store) {
  const at = ensureAflStore(store);
  const confirmedCount = at.entries.filter((e) => e.status === 'confirmed').length;
  const entryFee = at.season.entryFee || 75;
  const gross = confirmedCount * entryFee;
  const ps = at.season.prizeStructure || {};

  // Fixed per-comp KO prize (default $75 each, 2 comps)
  const knockoutEach = at.season.knockoutPrizeFixed || 75;
  const knockoutCount = Array.isArray(at.knockout) ? at.knockout.length : 2;
  const knockoutTotal = knockoutEach * knockoutCount;

  // Weekly jackpot = $1 per confirmed entrant per round (no fixed house base)
  const weeklyPrizePerUser = at.season.weeklyPrizePerUser || 1;
  const weeklyBase = confirmedCount * weeklyPrizePerUser;

  // Season leaderboard pool = gross minus fixed KO and weekly prizes
  // If store has explicit leaderboard percentages use them; otherwise take what's left
  let seasonLeaderboardPool;
  if (ps.seasonLeaderboard) {
    seasonLeaderboardPool = gross * ps.seasonLeaderboard;
  } else {
    // Use first+second+third as fractions of gross (store structure: { first, second, third, house })
    const leaderboardFraction = (ps.first || 0.4) + (ps.second || 0.25) + (ps.third || 0.15);
    seasonLeaderboardPool = gross * leaderboardFraction;
  }

  // Per-place amounts
  const lp = ps.leaderboardPayout || {};
  let first, second, third;
  if (lp.first) {
    // New-style: fractions of seasonLeaderboardPool
    first = seasonLeaderboardPool * lp.first;
    second = seasonLeaderboardPool * lp.second;
    third = seasonLeaderboardPool * lp.third;
  } else {
    // Old-style: fractions directly off gross
    first  = gross * (ps.first  || 0.4);
    second = gross * (ps.second || 0.25);
    third  = gross * (ps.third  || 0.15);
    seasonLeaderboardPool = first + second + third;
  }

  const totalPrizePool = seasonLeaderboardPool + knockoutTotal + weeklyBase;

  return {
    confirmedCount,
    entryFee,
    gross,
    seasonLeaderboardPool,
    knockoutPool: knockoutTotal,
    knockoutTotal,
    knockoutEach,
    weeklyBase,
    weeklyPool: weeklyBase,
    first,
    second,
    third,
    totalPrizePool
  };
}

// ── Email helpers ─────────────────────────────────────────────────────────────

async function sendTipReminderEmail(store, roundId, { getSmtpTransport, SMTP_FROM, ALERTS_BASE_URL }) {
  const at = ensureAflStore(store);
  const round = at.rounds.find((r) => r.id === roundId);
  if (!round) throw new Error('Round not found');

  const transporter = getSmtpTransport();
  if (!transporter) throw new Error('SMTP not configured');

  const confirmedEntries = at.entries.filter((e) => e.status === 'confirmed' && e.email);
  const results = [];

  for (const entry of confirmedEntries) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: entry.email,
        subject: `⏰ Don't forget! AFL Tipping — ${round.label} closes soon`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e5e7eb;padding:24px;border-radius:12px;">
            <h2 style="color:#60a5fa;">🏉 AFL 2026 Footy Tipping</h2>
            <p>Hi ${entry.member},</p>
            <p><strong>${round.label}</strong> is now open for tipping. Don't miss out — tips lock at kickoff!</p>
            <p style="margin:24px 0;">
              <a href="${ALERTS_BASE_URL}/afl-tipping/submit" style="background:#0050a0;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Submit Your Tips →</a>
            </p>
            <p style="color:#6b7280;font-size:0.85em;">Big Bluff Bay AFL Tipping 2026 · <a href="${ALERTS_BASE_URL}/afl-tipping" style="color:#60a5fa;">View Hub</a></p>
          </div>
        `
      });
      results.push({ email: entry.email, ok: true });
    } catch (err) {
      results.push({ email: entry.email, ok: false, error: err.message });
    }
  }
  return results;
}

async function sendResultsEmail(store, roundId, { getSmtpTransport, SMTP_FROM, ALERTS_BASE_URL }) {
  const at = ensureAflStore(store);
  const round = at.rounds.find((r) => r.id === roundId);
  if (!round) throw new Error('Round not found');

  const transporter = getSmtpTransport();
  if (!transporter) throw new Error('SMTP not configured');

  const confirmedEntries = at.entries.filter((e) => e.status === 'confirmed' && e.email);
  const results = [];

  // Build results summary
  const scores = round.scores || {};
  const ladder = Object.entries(scores)
    .sort((a, b) => b[1].correct - a[1].correct)
    .slice(0, 5);

  const ladderHtml = ladder.map(([uid, s], i) =>
    `<tr><td style="padding:6px 12px;font-weight:700;color:#60a5fa;">${i + 1}</td><td style="padding:6px 12px;">${s.member || uid}</td><td style="padding:6px 12px;text-align:center;">${s.correct}/${s.total}</td></tr>`
  ).join('');

  const jackpot = round.weeklyJackpot || {};
  const jackpotHtml = jackpot.rolledOver
    ? `<p>🎰 <strong>Weekly jackpot rolled over!</strong> Pot grows to $${jackpot.totalPot + (at.weeklyRollover || 0)} for next week.</p>`
    : jackpot.winnerMember
      ? `<p>🏆 <strong>${jackpot.winnerMember}</strong> won the weekly jackpot of <strong>$${jackpot.winnerPayout}</strong>!</p>`
      : '';

  for (const entry of confirmedEntries) {
    const userScore = scores[entry.userId];
    const scoreHtml = userScore
      ? `<p>Your score: <strong>${userScore.correct}/${userScore.total}</strong>${userScore.perfect ? ' 🌟 Perfect round!' : ''}</p>`
      : '<p>No tips recorded for you this round.</p>';

    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: entry.email,
        subject: `🏉 AFL Tipping Results — ${round.label}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e5e7eb;padding:24px;border-radius:12px;">
            <h2 style="color:#60a5fa;">🏉 ${round.label} Results</h2>
            <p>Hi ${entry.member},</p>
            ${scoreHtml}
            ${jackpotHtml}
            <h3 style="color:#60a5fa;">Top 5 This Round</h3>
            <table style="width:100%;border-collapse:collapse;background:#0c1d3a;border-radius:8px;overflow:hidden;">
              <thead><tr style="background:#0050a0;"><th style="padding:8px 12px;text-align:left;">Rank</th><th style="padding:8px 12px;text-align:left;">Player</th><th style="padding:8px 12px;text-align:center;">Score</th></tr></thead>
              <tbody>${ladderHtml}</tbody>
            </table>
            <p style="margin:24px 0;">
              <a href="${ALERTS_BASE_URL}/afl-tipping/leaderboard" style="background:#0050a0;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Full Leaderboard →</a>
            </p>
            <p style="color:#6b7280;font-size:0.85em;">Big Bluff Bay AFL Tipping 2026</p>
          </div>
        `
      });
      results.push({ email: entry.email, ok: true });
    } catch (err) {
      results.push({ email: entry.email, ok: false, error: err.message });
    }
  }
  return results;
}

// ── Optional JWT decode (for public routes) ───────────────────────────────────

function tryDecodeToken(req, JWT_SECRET) {
  try {
    const jwt = require('jsonwebtoken');
    const token = (req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

function registerAflTippingRoutes(app, { readStore, writeStore, auth, JWT_SECRET, getSmtpTransport, SMTP_FROM, ALERTS_BASE_URL }) {

  // ── Middleware: admin check ────────────────────────────────────────────────
  function adminCheck(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin only' });
    }
    next();
  }

  // ── PUBLIC ROUTES ─────────────────────────────────────────────────────────

  // GET /api/afl-tipping/overview
  app.get('/api/afl-tipping/overview', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const caller = tryDecodeToken(req, JWT_SECRET);

      const confirmedEntries = at.entries.filter((e) => e.status === 'confirmed');
      const pendingEntries = at.entries.filter((e) => e.status === 'pending');

      // Current round = latest open/locked, else latest pending
      const activeRound = at.rounds.find((r) => r.status === 'open') ||
        at.rounds.find((r) => r.status === 'locked') ||
        at.rounds.filter((r) => r.status === 'pending').slice(-1)[0] ||
        at.rounds.slice(-1)[0] || null;

      const ladder = buildSeasonLeaderboard(store);
      const maskedLadder = ladder.slice(0, 5).map((entry, i) => {
        if (i < 3 || caller) return entry;
        return { ...entry, member: `Member #${i + 1}`, userId: null };
      });

      const prizes = calcSeasonPrizes(store);
      const rollover = at.weeklyRollover || 0;
      const confirmedCount = at.entries.filter((e) => e.status === 'confirmed').length;
      const weeklyPot = (confirmedCount * (at.season.weeklyPrizePerUser || 1)) + rollover;

      // Banter for current round
      let banter = [];
      if (activeRound) {
        banter = (activeRound.banter || []).slice(-20);
      }

      // Strip tips from active round for non-admins
      let roundData = null;
      if (activeRound) {
        roundData = { ...activeRound };
        if (!caller || caller.role !== 'admin') {
          roundData = { ...activeRound, tips: undefined, scores: undefined };
        }
      }

      // KO competition status (with fallbacks)
      const koArray = Array.isArray(at.knockout) ? at.knockout : [];
      const koStatus = koArray.map(ko => {
        // Resolve userId list to member name objects for display
        const activePlayerIds = Array.isArray(ko.activePlayers) ? ko.activePlayers : [];
        const activePlayers = activePlayerIds.map(uid => {
          const e = at.entries.find(e => e.userId === uid);
          return { userId: uid, member: e ? e.member : uid };
        });
        return {
          id: ko.id,
          name: ko.name,
          startRound: ko.startRound || null,
          status: ko.status || 'pending',
          activePlayers,
          totalEliminated: ko.eliminated ? ko.eliminated.length : 0,
          winner: ko.winner || null
        };
      });

      res.json({
        ok: true,
        season: at.season,
        confirmedCount: confirmedEntries.length,
        pendingCount: pendingEntries.length,
        weeklyPot,
        rollover,
        prizes,
        currentRound: roundData,
        leaderboard: maskedLadder,
        banter,
        knockout: koStatus, // Return array of KO statuses
        teams: AFL_TEAMS,
        teamAbbr: AFL_TEAM_ABBR
      });
    } catch (err) {
      console.error("!!! SERVER ERROR in /api/afl-tipping/overview:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/rounds
  app.get('/api/afl-tipping/rounds', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const rounds = at.rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        label: r.label,
        status: r.status,
        openAt: r.openAt,
        lockAt: r.lockAt,
        gameCount: (r.games || []).length,
        createdAt: r.createdAt
      }));
      res.json({ ok: true, rounds });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/rounds/:roundId
  app.get('/api/afl-tipping/rounds/:roundId', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });
      const caller = tryDecodeToken(req, JWT_SECRET);
      const safe = caller && caller.role === 'admin'
        ? round
        : { ...round, tips: undefined, scores: undefined };
      res.json({ ok: true, round: safe });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/leaderboard
  app.get('/api/afl-tipping/leaderboard', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const caller = tryDecodeToken(req, JWT_SECRET);
      const ladder = buildSeasonLeaderboard(store);

      const masked = ladder.map((entry, i) => {
        if (i < 3 || caller) return entry;
        return { ...entry, member: `Member #${i + 1}`, userId: null };
      });

      const prizes = calcSeasonPrizes(store);
      const scoredRounds = at.rounds.filter((r) => r.status === 'scored');
      const latestRound = scoredRounds[scoredRounds.length - 1] || null;
      const confirmedCount = at.entries.filter((e) => e.status === 'confirmed').length;
      const weeklyPot = (confirmedCount * (at.season.weeklyPrizePerUser || 1)) + (at.weeklyRollover || 0);

      // Weekly breakdown for latest round
      let weeklyBreakdown = [];
      if (latestRound) {
        weeklyBreakdown = Object.entries(latestRound.scores || {})
          .map(([userId, score]) => ({ userId, ...score }))
          .sort((a, b) => b.correct - a.correct);
      }

      res.json({
        ok: true,
        ladder: masked,
        weeklyBreakdown,
        latestRound: latestRound ? { id: latestRound.id, label: latestRound.label, roundNumber: latestRound.roundNumber } : null,
        prizes,
        rollover: at.weeklyRollover || 0,
        weeklyPot
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/results
  app.get('/api/afl-tipping/results', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const scoredRounds = at.rounds.filter((r) => r.status === 'scored');
      const latest = scoredRounds[scoredRounds.length - 1] || null;
      if (!latest) return res.json({ ok: true, round: null, rounds: [] });

      const caller = tryDecodeToken(req, JWT_SECRET);
      const userScores = Object.entries(latest.scores || {})
        .map(([userId, s]) => ({ userId, ...s }))
        .sort((a, b) => b.correct - a.correct);

      res.json({
        ok: true,
        round: latest,
        userScores,
        rounds: scoredRounds.map((r) => ({ id: r.id, label: r.label, roundNumber: r.roundNumber }))
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/results/:roundId
  app.get('/api/afl-tipping/results/:roundId', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });
      if (round.status !== 'scored') return res.status(400).json({ ok: false, error: 'Round not yet scored' });

      const caller = tryDecodeToken(req, JWT_SECRET);
      const userScores = Object.entries(round.scores || {})
        .map(([userId, s]) => ({ userId, ...s }))
        .sort((a, b) => b.correct - a.correct);

      const scoredRounds = at.rounds.filter((r) => r.status === 'scored');
      res.json({
        ok: true,
        round,
        userScores,
        rounds: scoredRounds.map((r) => ({ id: r.id, label: r.label, roundNumber: r.roundNumber }))
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/banter/:roundId
  app.get('/api/afl-tipping/banter/:roundId', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });
      const banter = (round.banter || []).slice(-50);
      res.json({ ok: true, banter });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/analytics
  app.get('/api/afl-tipping/analytics', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const confirmedCount = at.entries.filter((e) => e.status === 'confirmed').length;
      const totalRounds = at.rounds.length;
      const scoredRounds = at.rounds.filter((r) => r.status === 'scored').length;
      res.json({
        ok: true,
        confirmedCount,
        totalRounds,
        scoredRounds,
        weeklyEngagement: at.analytics.weeklyEngagement
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/knockout
  app.get('/api/afl-tipping/knockout', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const caller = tryDecodeToken(req, JWT_SECRET);
      const prizes = calcSeasonPrizes(store);
      
      // Ensure knockout object exists
      const ko = at.knockout || {};
      
      // Get active player details
      const activePlayerDetails = (ko.activePlayers || []).map(userId => {
        const entry = at.entries.find(e => e.userId === userId);
        return {
          userId: caller ? userId : null, // Hide userIds from non-logged-in users
          member: entry ? entry.member : 'Unknown'
        };
      });

      // Get recent eliminations (last 5)
      const recentEliminations = (ko.eliminated || [])
        .slice(-5)
        .reverse()
        .map(elim => ({
          member: elim.member || 'Unknown',
          roundLabel: elim.roundLabel || 'Unknown',
          incorrectPick: elim.incorrectPick || null,
          correctPick: elim.correctPick || null
        }));

      res.json({
        ok: true,
        status: ko.status || 'active',
        activePlayers: activePlayerDetails,
        totalEliminated: ko.eliminated ? ko.eliminated.length : 0,
        recentEliminations,
        prizePot: prizes.knockout || 75,
        winner: ko.winner || null,
        startedAt: ko.startedAt || Date.now()
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── AUTH REQUIRED ROUTES ──────────────────────────────────────────────────

  // ── TOOLBOX ROUTES ────────────────────────────────────────────────────────

  // GET /api/afl-tipping/my-toolbox
  app.get('/api/afl-tipping/my-toolbox', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const entry = at.entries.find((e) => e.userId === userId && e.status !== 'withdrawn');
      if (!entry) return res.json({ ok: true, toolbox: null });
      const tb = ensureToolbox(entry, at.season.year || new Date().getFullYear());
      res.json({ ok: true, toolbox: tb });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/toolbox/activate  { roundId }
  app.post('/api/afl-tipping/toolbox/activate', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const { roundId } = req.body || {};
      if (!roundId) return res.status(400).json({ ok: false, error: 'roundId required' });

      const entry = at.entries.find((e) => e.userId === userId && e.status === 'confirmed');
      if (!entry) return res.status(403).json({ ok: false, error: 'Confirmed entry required' });

      const round = at.rounds.find((r) => r.id === roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });

      // Cannot activate after round locks
      const now = Date.now();
      const lockAt = round.lockAt || null;
      if (round.status === 'locked' || round.status === 'scored' || round.status === 'scoring') {
        return res.status(400).json({ ok: false, error: 'Round is locked — cannot activate Double Points' });
      }
      if (lockAt && now >= lockAt) {
        return res.status(400).json({ ok: false, error: 'Round lockout has passed — cannot activate Double Points' });
      }

      const tb = ensureToolbox(entry, at.season.year || new Date().getFullYear());

      // Already active for this round
      if (tb.doublePointsActiveRounds.includes(roundId)) {
        return res.json({ ok: true, toolbox: tb, message: 'Already active for this round' });
      }

      if (tb.doublePointsRemaining <= 0) {
        return res.status(400).json({ ok: false, error: 'No Double Points tokens remaining' });
      }

      // Cannot have more than one activation per round (enforced by design — it's per-user per-round)
      tb.doublePointsActiveRounds.push(roundId);
      tb.doublePointsRemaining = Math.max(0, tb.doublePointsRemaining - 1);

      writeStore(store);
      res.json({ ok: true, toolbox: tb });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/toolbox/deactivate  { roundId }
  app.post('/api/afl-tipping/toolbox/deactivate', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const { roundId } = req.body || {};
      if (!roundId) return res.status(400).json({ ok: false, error: 'roundId required' });

      const entry = at.entries.find((e) => e.userId === userId && e.status === 'confirmed');
      if (!entry) return res.status(403).json({ ok: false, error: 'Confirmed entry required' });

      const round = at.rounds.find((r) => r.id === roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });

      // Cannot deactivate after round locks
      const now = Date.now();
      const lockAt = round.lockAt || null;
      if (round.status === 'locked' || round.status === 'scored' || round.status === 'scoring') {
        return res.status(400).json({ ok: false, error: 'Round is locked — cannot deactivate Double Points' });
      }
      if (lockAt && now >= lockAt) {
        return res.status(400).json({ ok: false, error: 'Round lockout has passed — cannot deactivate Double Points' });
      }

      const tb = ensureToolbox(entry, at.season.year || new Date().getFullYear());

      const idx = tb.doublePointsActiveRounds.indexOf(roundId);
      if (idx === -1) {
        return res.json({ ok: true, toolbox: tb, message: 'Not active for this round' });
      }

      tb.doublePointsActiveRounds.splice(idx, 1);
      tb.doublePointsRemaining = Math.min(1, tb.doublePointsRemaining + 1);

      writeStore(store);
      res.json({ ok: true, toolbox: tb });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── AUTH REQUIRED ROUTES ──────────────────────────────────────────────────

  // GET /api/afl-tipping/my-entry — check current user's entry status (no side effects)
  app.get('/api/afl-tipping/my-entry', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const entry = at.entries.find((e) => e.userId === userId && e.status !== 'withdrawn') || null;
      res.json({ ok: true, entry });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/my-tips
  app.get('/api/afl-tipping/my-tips', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;

      const activeRound = at.rounds.find((r) => r.status === 'open') ||
        at.rounds.find((r) => r.status === 'locked') || null;

      if (!activeRound) return res.json({ ok: true, tips: [], round: null, marginPrediction: 0 });
      const tips = activeRound.tips[userId] || [];
      const marginPrediction = activeRound.margins && activeRound.margins[userId] ? activeRound.margins[userId].prediction : 0;
      res.json({ ok: true, tips, round: { id: activeRound.id, label: activeRound.label, games: activeRound.games }, marginPrediction });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/my-tips/:roundId
  app.get('/api/afl-tipping/my-tips/:roundId', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });
      const tips = round.tips[userId] || [];
      const marginPrediction = round.margins && round.margins[userId] ? round.margins[userId].prediction : 0;
      res.json({ ok: true, tips, round: { id: round.id, label: round.label, games: round.games }, marginPrediction });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/tips
  app.post('/api/afl-tipping/tips', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const username = req.user.username;

      // Must have confirmed entry
      const entry = at.entries.find((e) => e.userId === userId && e.status === 'confirmed');
      if (!entry) return res.status(403).json({ ok: false, error: 'You must have a confirmed entry to submit tips. Please register and pay.' });

      const { roundId, tips, marginPrediction } = req.body || {};
      if (!roundId || !Array.isArray(tips)) {
        return res.status(400).json({ ok: false, error: 'roundId and tips[] required' });
      }

      const round = at.rounds.find((r) => r.id === roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });
      if (round.status !== 'open') return res.status(400).json({ ok: false, error: `Round is ${round.status}, not accepting tips` });

      const now = Date.now();
      const gameMap = {};
      for (const g of round.games) gameMap[g.id] = g;

      const validatedTips = [];
      for (const tip of tips) {
        const game = gameMap[tip.gameId];
        if (!game) continue; // unknown game
        if (now >= game.kickoff) continue; // game locked
        if (tip.pick !== game.homeTeam && tip.pick !== game.awayTeam) continue; // invalid pick

        validatedTips.push({
          gameId: tip.gameId,
          pick: tip.pick,
          submittedAt: now
        });
      }

      // Merge with existing tips (preserve locked game tips)
      const existingTips = round.tips[userId] || [];
      const lockedGameIds = round.games
        .filter((g) => now >= g.kickoff)
        .map((g) => g.id);

      const preserved = existingTips.filter((t) => lockedGameIds.includes(t.gameId));
      const merged = [...preserved, ...validatedTips];
      round.tips[userId] = merged;

      // Store margin prediction (only if round not locked yet)
      const firstGame = round.games[0];
      const roundLocked = firstGame && now >= firstGame.kickoff;
      
      if (!roundLocked && typeof marginPrediction === 'number' && marginPrediction >= 0) {
        if (!round.margins) round.margins = {};
        round.margins[userId] = {
          prediction: marginPrediction,
          submittedAt: now
        };
      }

      round.updatedAt = now;

      writeStore(store);
      res.json({ 
        ok: true, 
        tips: merged, 
        submittedCount: validatedTips.length,
        marginPrediction: round.margins && round.margins[userId] ? round.margins[userId].prediction : 0
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/enter
  app.post('/api/afl-tipping/enter', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const username = req.user.username;

      // Check if already entered
      const existing = at.entries.find((e) => e.userId === userId && e.status !== 'withdrawn');
      if (existing) {
        return res.json({ ok: true, entry: existing, message: 'Already registered' });
      }

      const { email } = req.body || {};
      const entry = {
        id: crypto.randomUUID(),
        userId,
        member: username,
        email: String(email || '').trim(),
        status: 'pending',
        paid: false,
        paidAt: null,
        entryFee: at.season.entryFee || 75,
        notes: '',
        createdAt: Date.now()
      };

      // Grant season toolbox (2× Double Points) at join time
      ensureToolbox(entry, at.season.year || new Date().getFullYear());

      at.entries.push(entry);
      writeStore(store);
      res.json({ ok: true, entry });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/pay
  app.post('/api/afl-tipping/pay', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;

      const entry = at.entries.find((e) => e.userId === userId && e.status !== 'withdrawn');
      if (!entry) return res.status(400).json({ ok: false, error: 'No entry found. Please register first.' });

      const { method } = req.body || {};
      at.paymentAudit.push({
        id: crypto.randomUUID(),
        entryId: entry.id,
        userId,
        method: method || 'bsb',
        amount: entry.entryFee,
        note: 'Payment intent declared by user',
        createdAt: Date.now()
      });

      if (entry.notes) {
        entry.notes += '\nPayment intent declared via website.';
      } else {
        entry.notes = 'Payment intent declared via website.';
      }

      writeStore(store);
      res.json({ ok: true, entry, message: 'Payment intent recorded. Admin will confirm once transfer is received.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/banter
  app.post('/api/afl-tipping/banter', auth, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const userId = req.user.sub;
      const username = req.user.username;

      const { roundId, message } = req.body || {};
      if (!roundId || !message) return res.status(400).json({ ok: false, error: 'roundId and message required' });

      const msg = String(message).trim().slice(0, 280);
      if (!msg) return res.status(400).json({ ok: false, error: 'Empty message' });

      const round = at.rounds.find((r) => r.id === roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });

      if (!Array.isArray(round.banter)) round.banter = [];
      const banterItem = {
        id: crypto.randomUUID(),
        userId,
        member: username,
        message: msg,
        createdAt: Date.now()
      };
      round.banter.push(banterItem);

      // Keep last 200 banter items
      if (round.banter.length > 200) round.banter = round.banter.slice(-200);

      writeStore(store);
      res.json({ ok: true, banter: banterItem });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── ADMIN ROUTES ──────────────────────────────────────────────────────────

  // GET /api/afl-tipping/admin/overview
  app.get('/api/afl-tipping/admin/overview', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const ladder = buildSeasonLeaderboard(store);
      const prizes = calcSeasonPrizes(store);
      res.json({
        ok: true,
        season: at.season,
        entries: at.entries,
        rounds: at.rounds,
        weeklyRollover: at.weeklyRollover,
        ladder,
        prizes,
        paymentAudit: at.paymentAudit,
        payoutAudit: at.payoutAudit,
        analytics: at.analytics
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/rounds
  app.post('/api/afl-tipping/admin/rounds', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const { roundNumber, label, openAt, lockAt, games } = req.body || {};

      if (!roundNumber) return res.status(400).json({ ok: false, error: 'roundNumber required' });

      const parsedGames = (games || []).map((g) => ({
        id: crypto.randomUUID(),
        homeTeam: String(g.homeTeam || ''),
        awayTeam: String(g.awayTeam || ''),
        venue: String(g.venue || ''),
        kickoff: Number(g.kickoff) || 0,
        result: null
      }));

      // Auto-derive lockAt from earliest kickoff if not provided
      const derivedLockAt = lockAt || (parsedGames.length
        ? Math.min(...parsedGames.map((g) => g.kickoff).filter(Boolean))
        : null);

      const round = {
        id: crypto.randomUUID(),
        roundNumber: Number(roundNumber),
        label: label || `Round ${roundNumber}`,
        status: 'pending',
        openAt: openAt ? Number(openAt) : null,
        lockAt: derivedLockAt ? Number(derivedLockAt) : null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        games: parsedGames,
        tips: {},
        scores: {},
        weeklyJackpot: {
          basePot: confirmedCount * (at.season.weeklyPrizePerUser || 1),
          rolloverIn: at.weeklyRollover || 0,
          totalPot: (confirmedCount * (at.season.weeklyPrizePerUser || 1)) + (at.weeklyRollover || 0),
          winnerId: null,
          winnerMember: null,
          winnerPayout: null,
          rolledOver: false,
          settledAt: null
        },
        banter: []
      };

      at.rounds.push(round);
      writeStore(store);
      res.json({ ok: true, round });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PUT /api/afl-tipping/admin/rounds/:roundId
  app.put('/api/afl-tipping/admin/rounds/:roundId', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });

      const allowed = ['roundNumber', 'label', 'status', 'openAt', 'lockAt'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) round[key] = req.body[key];
      }

      // Update games if provided
      if (Array.isArray(req.body.games)) {
        round.games = req.body.games.map((g) => ({
          id: g.id || crypto.randomUUID(),
          homeTeam: String(g.homeTeam || ''),
          awayTeam: String(g.awayTeam || ''),
          venue: String(g.venue || ''),
          kickoff: Number(g.kickoff) || 0,
          result: g.result || null
        }));
      }

      round.updatedAt = Date.now();
      writeStore(store);
      res.json({ ok: true, round });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // DELETE /api/afl-tipping/admin/rounds/:roundId
  app.delete('/api/afl-tipping/admin/rounds/:roundId', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const idx = at.rounds.findIndex((r) => r.id === req.params.roundId);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Round not found' });
      at.rounds.splice(idx, 1);
      writeStore(store);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/rounds/:roundId/result
  app.post('/api/afl-tipping/admin/rounds/:roundId/result', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });

      const { gameId, winner, homeScore, awayScore } = req.body || {};
      if (!gameId || !winner) return res.status(400).json({ ok: false, error: 'gameId and winner required' });

      const game = round.games.find((g) => g.id === gameId);
      if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });

      game.result = {
        winner: String(winner),
        homeScore: homeScore != null ? Number(homeScore) : null,
        awayScore: awayScore != null ? Number(awayScore) : null
      };
      round.updatedAt = Date.now();
      if (round.status !== 'scored') round.status = 'scoring';

      writeStore(store);
      res.json({ ok: true, game });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/rounds/:roundId/score
  app.post('/api/afl-tipping/admin/rounds/:roundId/score', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const result = scoreRound(store, req.params.roundId);
      writeStore(store);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/rounds/:roundId/open
  app.post('/api/afl-tipping/admin/rounds/:roundId/open', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });
      round.status = 'open';
      round.openAt = round.openAt || Date.now();
      round.updatedAt = Date.now();
      writeStore(store);
      res.json({ ok: true, round });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/rounds/:roundId/lock
  app.post('/api/afl-tipping/admin/rounds/:roundId/lock', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const round = at.rounds.find((r) => r.id === req.params.roundId);
      if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });
      round.status = 'locked';
      round.lockAt = round.lockAt || Date.now();
      round.updatedAt = Date.now();
      writeStore(store);
      res.json({ ok: true, round });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/admin/entries
  app.get('/api/afl-tipping/admin/entries', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      res.json({ ok: true, entries: at.entries });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PUT /api/afl-tipping/admin/entries/:entryId
  app.put('/api/afl-tipping/admin/entries/:entryId', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const entry = at.entries.find((e) => e.id === req.params.entryId);
      if (!entry) return res.status(404).json({ ok: false, error: 'Entry not found' });

      const { paid, status, notes } = req.body || {};
      if (paid !== undefined) {
        entry.paid = Boolean(paid);
        if (paid && !entry.paidAt) entry.paidAt = Date.now();
      }
      if (status !== undefined) entry.status = String(status);
      if (notes !== undefined) entry.notes = String(notes);

      at.paymentAudit.push({
        id: crypto.randomUUID(),
        entryId: entry.id,
        userId: entry.userId,
        action: 'admin-update',
        changes: { paid, status, notes },
        adminId: req.user.sub,
        createdAt: Date.now()
      });

      writeStore(store);
      res.json({ ok: true, entry });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/season/grant-toolbox — grant 2× DP tokens to all confirmed entries (idempotent)
  app.post('/api/afl-tipping/admin/season/grant-toolbox', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const seasonYear = at.season.year || new Date().getFullYear();
      let granted = 0;
      let skipped = 0;
      for (const entry of at.entries) {
        if (entry.status === 'withdrawn') continue;
        const before = entry.toolbox;
        ensureToolbox(entry, seasonYear);
        if (!before || before.season !== seasonYear) granted++;
        else skipped++;
      }
      writeStore(store);
      res.json({ ok: true, granted, skipped, message: `Toolbox granted to ${granted} entries (${skipped} already had one).` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/season/payout
  app.post('/api/afl-tipping/admin/season/payout', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const { userId, member, place, amount, note } = req.body || {};

      const payout = {
        id: crypto.randomUUID(),
        userId: userId || null,
        member: member || null,
        place: place || null,
        amount: Number(amount) || 0,
        note: note || '',
        adminId: req.user.sub,
        createdAt: Date.now()
      };

      at.payoutAudit.push(payout);
      writeStore(store);
      res.json({ ok: true, payout });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/email/reminder
  app.post('/api/afl-tipping/admin/email/reminder', auth, adminCheck, async (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const { roundId } = req.body || {};
      if (!roundId) return res.status(400).json({ ok: false, error: 'roundId required' });
      const results = await sendTipReminderEmail(store, roundId, { getSmtpTransport, SMTP_FROM, ALERTS_BASE_URL });
      res.json({ ok: true, results });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/afl-tipping/admin/email/results
  app.post('/api/afl-tipping/admin/email/results', auth, adminCheck, async (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const { roundId } = req.body || {};
      if (!roundId) return res.status(400).json({ ok: false, error: 'roundId required' });
      const results = await sendResultsEmail(store, roundId, { getSmtpTransport, SMTP_FROM, ALERTS_BASE_URL });
      res.json({ ok: true, results });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/winners — weekly winners history with jackpot trajectory
  app.get('/api/afl-tipping/winners', (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const scoredRounds = at.rounds.filter((r) => r.status === 'scored');

      const weeklyWinners = scoredRounds.map((r) => {
        const jk = r.weeklyJackpot || {};
        return {
          roundId: r.id,
          roundNumber: r.roundNumber,
          label: r.label || ('Round ' + r.roundNumber),
          scoredAt: r.updatedAt,
          jackpotTotal: jk.totalPot || (confirmedCount * (at.season.weeklyPrizePerUser || 1)),
          rolledOver: jk.rolledOver || false,
          winnerId: jk.rolledOver ? null : (jk.winnerId || null),
          winnerMember: jk.rolledOver ? null : (jk.winnerMember || null),
          winnerPayout: jk.rolledOver ? null : (jk.winnerPayout || null),
          topScore: jk.rolledOver
            ? (Object.values(r.scores || {}).sort((a, b) => b.correct - a.correct)[0] || {}).correct || 0
            : (r.scores && jk.winnerId ? (r.scores[jk.winnerId] || {}).correct : null)
        };
      });

      const ladder = buildSeasonLeaderboard(store);

      res.json({
        ok: true,
        season: { name: at.season.name, year: at.season.year },
        weeklyWinners,
        currentJackpot: (confirmedCount * (at.season.weeklyPrizePerUser || 1)) + (at.weeklyRollover || 0),
        rollover: at.weeklyRollover || 0,
        leaderboard: ladder.slice(0, 10),
        roundsPlayed: scoredRounds.length
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl/summary — fast cached summary for homepage block
  let _summaryCache = null;
  let _summaryCacheTs = 0;
  const SUMMARY_TTL = 60000; // 60s cache

  app.get('/api/afl/summary', (req, res) => {
    try {
      const now = Date.now();
      if (_summaryCache && (now - _summaryCacheTs) < SUMMARY_TTL) {
        return res.json(_summaryCache);
      }

      const store = readStore();
      const at = ensureAflStore(store);
      const confirmedEntries = at.entries.filter((e) => e.status === 'confirmed');
      const pendingEntries = at.entries.filter((e) => e.status === 'pending');
      const rollover = at.weeklyRollover || 0;
      const weeklyPot = (confirmedEntries.length * (at.season.weeklyPrizePerUser || 1)) + rollover;

      const activeRound = at.rounds.find((r) => r.status === 'open') ||
        at.rounds.find((r) => r.status === 'locked') || null;

      const ladder = buildSeasonLeaderboard(store);

      // Next lockout game
      let nextLockout = null;
      if (activeRound && activeRound.games) {
        const nowMs = Date.now();
        const upcoming = activeRound.games
          .filter((g) => !g.locked && g.kickoff && new Date(g.kickoff).getTime() > nowMs)
          .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
        if (upcoming.length > 0) {
          nextLockout = {
            kickoff: upcoming[0].kickoff,
            homeTeam: upcoming[0].homeTeam,
            awayTeam: upcoming[0].awayTeam,
            gameId: upcoming[0].id
          };
        }
      }

      // Last banter
      let banter = [];
      if (activeRound) banter = (activeRound.banter || []).slice(-3);

      const summary = {
        ok: true,
        confirmedCount: confirmedEntries.length,
        pendingCount: pendingEntries.length,
        weeklyPot,
        rollover,
        nextLockout,
        leaderboard: ladder.slice(0, 10),
        roundLabel: activeRound ? (activeRound.label || ('Round ' + activeRound.roundNumber)) : null,
        banter,
        cachedAt: now
      };

      _summaryCache = summary;
      _summaryCacheTs = now;

      res.json(summary);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/afl-tipping/admin/analytics
  app.get('/api/afl-tipping/admin/analytics', auth, adminCheck, (req, res) => {
    try {
      const store = readStore();
      const at = ensureAflStore(store);
      const confirmedCount = at.entries.filter((e) => e.status === 'confirmed').length;
      const pendingCount = at.entries.filter((e) => e.status === 'pending').length;
      const totalRounds = at.rounds.length;
      const scoredRounds = at.rounds.filter((r) => r.status === 'scored').length;

      const tippersByRound = at.rounds.filter((r) => r.status === 'scored').map((r) => ({
        roundId: r.id,
        roundNumber: r.roundNumber,
        label: r.label,
        tipperCount: Object.keys(r.tips || {}).length,
        scoredCount: Object.keys(r.scores || {}).length,
        jackpotWinner: (r.weeklyJackpot || {}).winnerMember || null,
        jackpotPot: (r.weeklyJackpot || {}).totalPot || 0,
        rolledOver: (r.weeklyJackpot || {}).rolledOver || false
      }));

      const prizes = calcSeasonPrizes(store);

      res.json({
        ok: true,
        confirmedCount,
        pendingCount,
        totalRounds,
        scoredRounds,
        tippersByRound,
        prizes,
        weeklyRollover: at.weeklyRollover || 0,
        weeklyEngagement: at.analytics.weeklyEngagement
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

module.exports = { registerAflTippingRoutes, ensureAflStore };
