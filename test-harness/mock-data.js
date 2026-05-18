// Mock pokerApi for browser-based testing without Electron IPC.
window.pokerApi = {
  getBankrollSummary: () =>
    Promise.resolve({
      allTimeNet: -934.5,
      currentYearNet: 0,
      currentMonthNet: 0,
      totalBuyIns: 3578,
      totalWinnings: 2643.5,
      tournamentsPlayed: 753,
      handsPlayed: 14675,
      bestMonth: { month: '2019-02', net: 5 },
      worstMonth: { month: '2020-10', net: -131 },
      bestYear: { year: 2021, net: -169 },
      worstYear: { year: 2020, net: -338.5 }
    }),
  getYearlyBankroll: () =>
    Promise.resolve([
      { year: 2018, net: -243, buyIns: 701, winnings: 458, tournamentsPlayed: 156, handsPlayed: 2961 },
      { year: 2019, net: -184, buyIns: 664, winnings: 480, tournamentsPlayed: 109, handsPlayed: 2447 },
      { year: 2020, net: -338.5, buyIns: 1659, winnings: 1320.5, tournamentsPlayed: 391, handsPlayed: 7211 },
      { year: 2021, net: -169, buyIns: 554, winnings: 385, tournamentsPlayed: 97, handsPlayed: 2056 }
    ]),
  getMonthlyBankroll: () => {
    const months = [];
    for (let y = 2018; y <= 2021; y++) {
      for (let m = 1; m <= 12; m++) {
        if (Math.random() > 0.4) {
          months.push({
            year: y,
            month: m,
            net: Math.random() * 200 - 120,
            buyIns: Math.random() * 100,
            winnings: Math.random() * 100,
            tournamentsPlayed: Math.floor(Math.random() * 20)
          });
        }
      }
    }
    return Promise.resolve(months);
  },
  getRoiByFormat: () =>
    Promise.resolve([
      { format: 'Starting Block', tournamentsPlayed: 1, totalBuyIns: 0, totalWinnings: 0, net: 0, roi: 0 },
      { format: 'Freeroll', tournamentsPlayed: 1, totalBuyIns: 0, totalWinnings: 0, net: 0, roi: 0 },
      { format: 'Campus League', tournamentsPlayed: 3, totalBuyIns: 0, totalWinnings: 0, net: 0, roi: 0 },
      { format: 'Hit&Run', tournamentsPlayed: 1, totalBuyIns: 2, totalWinnings: 0, net: -2, roi: -100 },
      { format: 'Expresso', tournamentsPlayed: 747, totalBuyIns: 3576, totalWinnings: 2643.5, net: -932.5, roi: -26.1 }
    ]),
  getRoiByStake: () => Promise.resolve([]),
  getBankrollChart: () => {
    let cumulative = 0;
    const points = [];
    const start = new Date('2018-08-02');
    for (let i = 0; i < 74; i++) {
      const date = new Date(start.getTime() + i * 86400000 * 14);
      const sessionNet = Math.random() * 50 - 35;
      cumulative += sessionNet;
      points.push({
        date: date.toISOString().slice(0, 10),
        sessionNet,
        cumulativeNet: cumulative
      });
    }
    return Promise.resolve(points);
  },
  getSessions: () =>
    Promise.resolve([
      { session_date: '2021-05-12', tournaments_played: 8, buy_ins: 40, winnings: 22, net: -18 },
      { session_date: '2021-04-30', tournaments_played: 5, buy_ins: 25, winnings: 30, net: 5 },
      { session_date: '2021-03-15', tournaments_played: 12, buy_ins: 60, winnings: 25, net: -35 }
    ]),
  getSessionDetail: () => Promise.resolve({ sessionDate: '2021-05-12', tournaments: [] }),
  getPlayers: () =>
    Promise.resolve([
      {
        playerName: 'Ka1ros',
        handsPlayed: 108,
        vpip: 54,
        pfr: 26,
        threeBet: 8,
        foldTo3bet: 60,
        cbet: 70,
        foldToCbet: 50,
        aggressionFactor: 1.1,
        wtsd: 35,
        wsd: 50,
        netResult: 1200,
        tendency: 'loose-aggressive'
      },
      {
        playerName: 'vincent1509',
        handsPlayed: 101,
        vpip: 41,
        pfr: 22,
        threeBet: 5,
        foldTo3bet: 50,
        cbet: 65,
        foldToCbet: 55,
        aggressionFactor: 1.2,
        wtsd: 28,
        wsd: 45,
        netResult: 800,
        tendency: 'loose-aggressive'
      },
      {
        playerName: 'Magik_2438.',
        handsPlayed: 101,
        vpip: 51,
        pfr: 25,
        threeBet: 7,
        foldTo3bet: 55,
        cbet: 72,
        foldToCbet: 48,
        aggressionFactor: 1.6,
        wtsd: 30,
        wsd: 52,
        netResult: -200,
        tendency: 'loose-aggressive'
      }
    ]),
  getPlayerDetail: () => Promise.resolve(null),
  getHand: () => Promise.resolve(null),
  importNewSession: () => Promise.resolve({ filesProcessed: 0, handsImported: 0, tournamentsImported: 0, errors: [] }),
  importAll: () => Promise.resolve({ filesProcessed: 0, handsImported: 0, tournamentsImported: 0, errors: [] }),
  reviewHand: () => Promise.resolve({}),
  reviewSession: () => Promise.resolve({}),
  getLeaks: () =>
    Promise.resolve([
      {
        id: 'position-sb',
        title: 'Small Blind leak',
        severity: 'high',
        description: 'Losing -573939 chips total from SB over 6177 hands.',
        cost: 573939,
        costUnit: 'chips',
        recommendation: 'SB is the worst position. Tighten up. Avoid limping. Steal more, defend less.'
      },
      {
        id: 'allin-preflop',
        title: 'Pre-flop all-in pattern is unprofitable',
        severity: 'high',
        description: 'Went all-in pre-flop 1112 times, net -445068 chips.',
        cost: 445068,
        costUnit: 'chips',
        recommendation:
          'Your shove range is likely too wide or your call range is too loose. Tighten up shoving spots.'
      },
      {
        id: 'format-expresso',
        title: 'Expresso: ROI -26.1%',
        severity: 'high',
        description: 'Played 747 Expresso tournaments for -932.50€ net (-26.1% ROI).',
        cost: 932.5,
        costUnit: 'eur',
        recommendation: 'Stop playing Expresso or take coaching. Current ROI is unsustainable.'
      }
    ]),
  getGameRecommendations: () =>
    Promise.resolve([
      {
        format: 'Expresso',
        stake: '1.00€',
        tournamentsPlayed: 110,
        roi: -4.5,
        netResult: -5,
        confidence: 'medium',
        recommendation: 'keep playing'
      },
      {
        format: 'Expresso',
        stake: '2.00€',
        tournamentsPlayed: 165,
        roi: -15.8,
        netResult: -52,
        confidence: 'medium',
        recommendation: 'investigate'
      },
      {
        format: 'Expresso',
        stake: '5.00€',
        tournamentsPlayed: 343,
        roi: -20.1,
        netResult: -345,
        confidence: 'high',
        recommendation: 'avoid'
      },
      {
        format: 'Expresso',
        stake: '10.00€',
        tournamentsPlayed: 117,
        roi: -28.2,
        netResult: -330,
        confidence: 'medium',
        recommendation: 'investigate'
      }
    ]),
  getProgress: () =>
    Promise.resolve([
      { period: '2018-Q3', tournamentsPlayed: 37, net: -61, roi: -41.5, itm: 30 },
      { period: '2018-Q4', tournamentsPlayed: 119, net: -182, roi: -32.9, itm: 27 },
      { period: '2019-Q1', tournamentsPlayed: 32, net: -2, roi: -1, itm: 38 },
      { period: '2019-Q2', tournamentsPlayed: 35, net: -25, roi: -11.9, itm: 34 },
      { period: '2020-Q4', tournamentsPlayed: 329, net: -238.5, roi: -18.7, itm: 31 },
      { period: '2021-Q1', tournamentsPlayed: 74, net: -108, roi: -26.8, itm: 31 }
    ])
};
