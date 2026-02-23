const { calculateCost, getModelLabel, PRICING } = require('./pricing');

class Aggregator {
  constructor() {
    this.reset();
  }

  reset() {
    this.messages = [];
    this._daily = {};
    this._sessions = {};
    this._projects = {};
    this._models = {};
    this._tools = {};
    this._hourly = {};
  }

  addMessages(messages) {
    for (const msg of messages) {
      this._addMessage(msg);
    }
    this.messages.push(...messages);
  }

  _addMessage(msg) {
    const date = msg.timestamp ? msg.timestamp.slice(0, 10) : 'unknown';
    const hour = msg.timestamp ? new Date(msg.timestamp).getHours() : 0;
    const totalTokens = msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
    const cost = calculateCost(msg.model, msg);

    // Daily
    if (!this._daily[date]) {
      this._daily[date] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0, sessions: new Set() };
    }
    const d = this._daily[date];
    d.inputTokens += msg.inputTokens;
    d.outputTokens += msg.outputTokens;
    d.cacheReadTokens += msg.cacheReadTokens;
    d.cacheCreateTokens += msg.cacheCreateTokens;
    d.cost += cost;
    d.messages++;
    if (msg.sessionId) d.sessions.add(msg.sessionId);

    // Session
    if (msg.sessionId) {
      if (!this._sessions[msg.sessionId]) {
        this._sessions[msg.sessionId] = {
          project: msg.project,
          models: new Set(),
          firstTs: msg.timestamp,
          lastTs: msg.timestamp,
          messages: 0,
          tools: {},
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreateTokens: 0,
          cost: 0
        };
      }
      const s = this._sessions[msg.sessionId];
      s.models.add(msg.model);
      if (msg.timestamp < s.firstTs) s.firstTs = msg.timestamp;
      if (msg.timestamp > s.lastTs) s.lastTs = msg.timestamp;
      s.messages++;
      s.inputTokens += msg.inputTokens;
      s.outputTokens += msg.outputTokens;
      s.cacheReadTokens += msg.cacheReadTokens;
      s.cacheCreateTokens += msg.cacheCreateTokens;
      s.cost += cost;
      for (const t of msg.tools) {
        s.tools[t] = (s.tools[t] || 0) + 1;
      }
    }

    // Project
    if (!this._projects[msg.project]) {
      this._projects[msg.project] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0, sessions: new Set() };
    }
    const p = this._projects[msg.project];
    p.inputTokens += msg.inputTokens;
    p.outputTokens += msg.outputTokens;
    p.cacheReadTokens += msg.cacheReadTokens;
    p.cacheCreateTokens += msg.cacheCreateTokens;
    p.cost += cost;
    p.messages++;
    if (msg.sessionId) p.sessions.add(msg.sessionId);

    // Model
    if (!this._models[msg.model]) {
      this._models[msg.model] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0 };
    }
    const m = this._models[msg.model];
    m.inputTokens += msg.inputTokens;
    m.outputTokens += msg.outputTokens;
    m.cacheReadTokens += msg.cacheReadTokens;
    m.cacheCreateTokens += msg.cacheCreateTokens;
    m.cost += cost;
    m.messages++;

    // Tools
    for (const t of msg.tools) {
      this._tools[t] = (this._tools[t] || 0) + 1;
    }

    // Hourly
    if (!this._hourly[hour]) {
      this._hourly[hour] = { tokens: 0, messages: 0 };
    }
    this._hourly[hour].tokens += totalTokens;
    this._hourly[hour].messages++;
  }

  getOverview(from, to) {
    const daily = this.getDaily(from, to);
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreate = 0, totalCost = 0, totalMessages = 0;
    const sessionSet = new Set();

    for (const d of daily) {
      totalInput += d.inputTokens;
      totalOutput += d.outputTokens;
      totalCacheRead += d.cacheReadTokens;
      totalCacheCreate += d.cacheCreateTokens;
      totalCost += d.cost;
      totalMessages += d.messages;
    }

    for (const [date, data] of Object.entries(this._daily)) {
      if ((!from || date >= from) && (!to || date <= to)) {
        for (const sid of data.sessions) sessionSet.add(sid);
      }
    }

    return {
      totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheCreate,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheCreateTokens: totalCacheCreate,
      estimatedCost: Math.round(totalCost * 100) / 100,
      sessions: sessionSet.size,
      messages: totalMessages,
      periodFrom: from || Object.keys(this._daily).sort()[0] || null,
      periodTo: to || Object.keys(this._daily).sort().pop() || null
    };
  }

  getDaily(from, to) {
    return Object.entries(this._daily)
      .filter(([date]) => (!from || date >= from) && (!to || date <= to))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cacheReadTokens: data.cacheReadTokens,
        cacheCreateTokens: data.cacheCreateTokens,
        cost: Math.round(data.cost * 100) / 100,
        messages: data.messages,
        sessions: data.sessions.size
      }));
  }

  getSessions(project, model) {
    return Object.entries(this._sessions)
      .filter(([_id, s]) => {
        if (project && s.project !== project) return false;
        if (model && !s.models.has(model)) return false;
        return true;
      })
      .sort(([, a], [, b]) => b.firstTs.localeCompare(a.firstTs))
      .map(([id, s]) => ({
        id,
        project: s.project,
        models: [...s.models].map(m => getModelLabel(m)),
        firstTs: s.firstTs,
        lastTs: s.lastTs,
        durationMin: Math.round((new Date(s.lastTs) - new Date(s.firstTs)) / 60000),
        messages: s.messages,
        toolCalls: Object.values(s.tools).reduce((a, b) => a + b, 0),
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheReadTokens: s.cacheReadTokens,
        cacheCreateTokens: s.cacheCreateTokens,
        totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens,
        cost: Math.round(s.cost * 100) / 100
      }));
  }

  getSession(id) {
    const s = this._sessions[id];
    if (!s) return null;
    return {
      id,
      project: s.project,
      models: [...s.models].map(m => getModelLabel(m)),
      firstTs: s.firstTs,
      lastTs: s.lastTs,
      durationMin: Math.round((new Date(s.lastTs) - new Date(s.firstTs)) / 60000),
      messages: s.messages,
      tools: s.tools,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheReadTokens: s.cacheReadTokens,
      cacheCreateTokens: s.cacheCreateTokens,
      totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens,
      cost: Math.round(s.cost * 100) / 100
    };
  }

  getProjects() {
    return Object.entries(this._projects)
      .sort(([, a], [, b]) => (b.inputTokens + b.outputTokens + b.cacheReadTokens + b.cacheCreateTokens) - (a.inputTokens + a.outputTokens + a.cacheReadTokens + a.cacheCreateTokens))
      .map(([name, p]) => ({
        name,
        totalTokens: p.inputTokens + p.outputTokens + p.cacheReadTokens + p.cacheCreateTokens,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
        cacheReadTokens: p.cacheReadTokens,
        cacheCreateTokens: p.cacheCreateTokens,
        cost: Math.round(p.cost * 100) / 100,
        messages: p.messages,
        sessions: p.sessions.size
      }));
  }

  getModels() {
    return Object.entries(this._models)
      .filter(([model]) => model !== '<synthetic>')
      .sort(([, a], [, b]) => b.cost - a.cost)
      .map(([model, m]) => ({
        model,
        label: getModelLabel(model),
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheReadTokens: m.cacheReadTokens,
        cacheCreateTokens: m.cacheCreateTokens,
        totalTokens: m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreateTokens,
        cost: Math.round(m.cost * 100) / 100,
        messages: m.messages
      }));
  }

  getTools() {
    const total = Object.values(this._tools).reduce((a, b) => a + b, 0);
    return Object.entries(this._tools)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round(count / total * 1000) / 10
      }));
  }

  getHourly() {
    const result = [];
    for (let h = 0; h < 24; h++) {
      const data = this._hourly[h] || { tokens: 0, messages: 0 };
      result.push({ hour: h, tokens: data.tokens, messages: data.messages });
    }
    return result;
  }

  getDailyByModel(from, to) {
    const daily = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? msg.timestamp.slice(0, 10) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (!daily[date]) daily[date] = {};
      const model = getModelLabel(msg.model);
      if (!daily[date][model]) daily[date][model] = 0;
      daily[date][model] += msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
    }
    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, models]) => ({ date, ...models }));
  }

  // --- Insights methods ---

  /** Distribution of stop reasons */
  getStopReasons() {
    const counts = {};
    for (const msg of this.messages) {
      const reason = msg.stopReason || 'unknown';
      counts[reason] = (counts[reason] || 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: Math.round(count / total * 1000) / 10
      }));
  }

  /** Messages/tokens/cost grouped by day of week (0=Sun..6=Sat) */
  getDayOfWeek() {
    const days = Array.from({ length: 7 }, () => ({ tokens: 0, messages: 0, cost: 0 }));
    for (const msg of this.messages) {
      if (!msg.timestamp) continue;
      const dow = new Date(msg.timestamp).getDay();
      const cost = calculateCost(msg.model, msg);
      days[dow].tokens += msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
      days[dow].messages++;
      days[dow].cost += cost;
    }
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map((d, i) => ({
      day: labels[i],
      dayIndex: i,
      tokens: d.tokens,
      messages: d.messages,
      cost: Math.round(d.cost * 100) / 100
    }));
  }

  /** Daily cache hit rate: cache_read / (input + cache_read + cache_create) */
  getCacheEfficiency(from, to) {
    const daily = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? msg.timestamp.slice(0, 10) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (!daily[date]) daily[date] = { cacheRead: 0, totalInput: 0 };
      daily[date].cacheRead += msg.cacheReadTokens;
      daily[date].totalInput += msg.inputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
    }
    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        cacheHitRate: d.totalInput > 0 ? Math.round(d.cacheRead / d.totalInput * 1000) / 10 : 0
      }));
  }

  /** Cumulative cost over time */
  getCumulativeCost(from, to) {
    const dailyData = this.getDaily(from, to);
    let cumulative = 0;
    return dailyData.map(d => {
      cumulative += d.cost;
      return { date: d.date, cost: Math.round(cumulative * 100) / 100 };
    });
  }

  /** Daily cost broken down by token type (input cost, output cost, cache costs) */
  getDailyCostBreakdown(from, to) {
    const daily = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? msg.timestamp.slice(0, 10) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (!daily[date]) daily[date] = { inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheCreateCost: 0 };

      const pricing = PRICING[msg.model] || { input: 3, output: 15, cacheRead: 0.30, cacheCreate: 3.75 };
      daily[date].inputCost += (msg.inputTokens / 1_000_000) * pricing.input;
      daily[date].outputCost += (msg.outputTokens / 1_000_000) * pricing.output;
      daily[date].cacheReadCost += (msg.cacheReadTokens / 1_000_000) * pricing.cacheRead;
      daily[date].cacheCreateCost += (msg.cacheCreateTokens / 1_000_000) * pricing.cacheCreate;
    }
    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        inputCost: Math.round(d.inputCost * 100) / 100,
        outputCost: Math.round(d.outputCost * 100) / 100,
        cacheReadCost: Math.round(d.cacheReadCost * 100) / 100,
        cacheCreateCost: Math.round(d.cacheCreateCost * 100) / 100
      }));
  }

  /** Tokens-per-message and cost-per-message per session */
  getSessionEfficiency() {
    return Object.entries(this._sessions)
      .filter(([, s]) => s.messages > 0)
      .map(([id, s]) => {
        const totalTokens = s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens;
        return {
          id,
          project: s.project,
          messages: s.messages,
          tokensPerMessage: Math.round(totalTokens / s.messages),
          costPerMessage: Math.round(s.cost / s.messages * 1000) / 1000
        };
      })
      .sort((a, b) => b.costPerMessage - a.costPerMessage);
  }
}

module.exports = Aggregator;
