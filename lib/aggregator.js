const { calculateCost, getModelLabel, PRICING } = require('./pricing');

function toLocalDate(isoString) {
  const d = new Date(isoString);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Compute active working minutes from sorted timestamps.
 * Gaps > maxGapMin are treated as inactive (breaks, waiting, etc.)
 */
function computeActiveMinutes(timestamps, maxGapMin = 5) {
  if (!timestamps || timestamps.length < 2) return timestamps?.length ? 1 : 0;
  const sorted = [...timestamps].sort();
  let active = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 60000;
    active += Math.min(gap, maxGapMin);
  }
  return Math.round(active);
}

class Aggregator {
  constructor() {
    this.reset();
  }

  reset() {
    this._messageById = new Map();
    this._daily = {};
    this._sessions = {};
    this._projects = {};
    this._models = {};
    this._tools = {};
    this._hourly = {};
    this._rateLimits = {};
    this._rateLimitIds = new Set();
    // Tool cost attribution
    this._toolStats = {};    // toolName -> { calls, cost, tokens, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens, messages }
    this._mcpServers = {};   // serverName -> { tools: { toolName -> { calls, cost, tokens } }, totalCalls, totalCost }
    this._subagentStats = { messages: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0 };
    this._subagentDaily = {};
    this._toolCostDaily = {}; // date -> { toolName -> cost }
  }

  /** Messages array derived from the dedup map (canonical source of truth) */
  get messages() {
    return [...this._messageById.values()];
  }

  addMessages(messages) {
    for (const msg of messages) {
      this._addMessage(msg);
    }
  }

  addRateLimitEvents(events) {
    for (const evt of events) {
      if (this._rateLimitIds.has(evt.id)) continue;
      this._rateLimitIds.add(evt.id);
      const date = evt.timestamp ? toLocalDate(evt.timestamp) : 'unknown';
      this._rateLimits[date] = (this._rateLimits[date] || 0) + 1;
    }
  }

  getRateLimits(from, to) {
    let total = 0;
    const daily = [];
    for (const [date, count] of Object.entries(this._rateLimits)) {
      if ((from && date < from) || (to && date > to)) continue;
      total += count;
      daily.push({ date, count });
    }
    daily.sort((a, b) => a.date.localeCompare(b.date));
    return { total, daily };
  }

  /**
   * Parse MCP tool name: mcp__server__tool → { server, tool, isMcp: true }
   * Built-in tools → { server: null, tool: name, isMcp: false }
   */
  static parseMcpTool(name) {
    if (name.startsWith('mcp__')) {
      const parts = name.slice(5).split('__');
      if (parts.length >= 2) {
        return { server: parts[0], tool: parts.slice(1).join('__'), isMcp: true, displayName: parts.slice(1).join('__') };
      }
    }
    return { server: null, tool: name, isMcp: false, displayName: name };
  }

  /**
   * Apply a delta (positive or negative) from a message to all aggregation maps.
   * sign = +1 to add, -1 to subtract.
   */
  _applyDelta(msg, sign) {
    const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
    const hour = msg.timestamp ? new Date(msg.timestamp).getHours() : 0;
    const cost = calculateCost(msg.model, msg);
    const totalTokens = msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;

    // Daily
    if (!this._daily[date]) {
      this._daily[date] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0, sessions: new Set(), linesAdded: 0, linesRemoved: 0, linesWritten: 0, toolCalls: 0, toolUseMessages: 0, tools: {} };
    }
    const d = this._daily[date];
    d.inputTokens += sign * msg.inputTokens;
    d.outputTokens += sign * msg.outputTokens;
    d.cacheReadTokens += sign * msg.cacheReadTokens;
    d.cacheCreateTokens += sign * msg.cacheCreateTokens;
    d.cost += sign * cost;
    d.messages += sign;
    d.linesAdded += sign * (msg.linesAdded || 0);
    d.linesRemoved += sign * (msg.linesRemoved || 0);
    d.linesWritten += sign * (msg.linesWritten || 0);
    d.toolCalls += sign * msg.tools.length;
    if (msg.stopReason === 'tool_use') d.toolUseMessages += sign;
    for (const t of msg.tools) { d.tools[t] = (d.tools[t] || 0) + sign; }
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
          cost: 0,
          linesAdded: 0,
          linesRemoved: 0,
          linesWritten: 0,
          _timestamps: []
        };
      }
      const s = this._sessions[msg.sessionId];
      s.models.add(msg.model);
      if (msg.timestamp < s.firstTs) s.firstTs = msg.timestamp;
      if (msg.timestamp > s.lastTs) s.lastTs = msg.timestamp;
      if (sign > 0 && msg.timestamp) s._timestamps.push(msg.timestamp);
      s.messages += sign;
      s.inputTokens += sign * msg.inputTokens;
      s.outputTokens += sign * msg.outputTokens;
      s.cacheReadTokens += sign * msg.cacheReadTokens;
      s.cacheCreateTokens += sign * msg.cacheCreateTokens;
      s.cost += sign * cost;
      s.linesAdded += sign * (msg.linesAdded || 0);
      s.linesRemoved += sign * (msg.linesRemoved || 0);
      s.linesWritten += sign * (msg.linesWritten || 0);
      for (const t of msg.tools) {
        s.tools[t] = (s.tools[t] || 0) + sign;
      }
    }

    // Project
    if (!this._projects[msg.project]) {
      this._projects[msg.project] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0, sessions: new Set(), linesAdded: 0, linesRemoved: 0, linesWritten: 0 };
    }
    const p = this._projects[msg.project];
    p.inputTokens += sign * msg.inputTokens;
    p.outputTokens += sign * msg.outputTokens;
    p.cacheReadTokens += sign * msg.cacheReadTokens;
    p.cacheCreateTokens += sign * msg.cacheCreateTokens;
    p.cost += sign * cost;
    p.messages += sign;
    p.linesAdded += sign * (msg.linesAdded || 0);
    p.linesRemoved += sign * (msg.linesRemoved || 0);
    p.linesWritten += sign * (msg.linesWritten || 0);
    if (msg.sessionId) p.sessions.add(msg.sessionId);

    // Model
    if (!this._models[msg.model]) {
      this._models[msg.model] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0 };
    }
    const m = this._models[msg.model];
    m.inputTokens += sign * msg.inputTokens;
    m.outputTokens += sign * msg.outputTokens;
    m.cacheReadTokens += sign * msg.cacheReadTokens;
    m.cacheCreateTokens += sign * msg.cacheCreateTokens;
    m.cost += sign * cost;
    m.messages += sign;

    // Tools
    for (const t of msg.tools) {
      this._tools[t] = (this._tools[t] || 0) + sign;
    }

    // Hourly
    if (!this._hourly[hour]) {
      this._hourly[hour] = {
        tokens: 0, messages: 0,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0,
        cost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheCreateCost: 0,
        linesAdded: 0, linesRemoved: 0, linesWritten: 0
      };
    }
    const hEntry = this._hourly[hour];
    hEntry.tokens += sign * totalTokens;
    hEntry.messages += sign;
    hEntry.inputTokens += sign * msg.inputTokens;
    hEntry.outputTokens += sign * msg.outputTokens;
    hEntry.cacheReadTokens += sign * msg.cacheReadTokens;
    hEntry.cacheCreateTokens += sign * msg.cacheCreateTokens;
    hEntry.cost += sign * cost;
    const hPricing = PRICING[msg.model] || { input: 3, output: 15, cacheRead: 0.30, cacheCreate: 3.75 };
    hEntry.inputCost += sign * (msg.inputTokens / 1_000_000) * hPricing.input;
    hEntry.outputCost += sign * (msg.outputTokens / 1_000_000) * hPricing.output;
    hEntry.cacheReadCost += sign * (msg.cacheReadTokens / 1_000_000) * hPricing.cacheRead;
    hEntry.cacheCreateCost += sign * (msg.cacheCreateTokens / 1_000_000) * hPricing.cacheCreate;
    hEntry.linesAdded += sign * (msg.linesAdded || 0);
    hEntry.linesRemoved += sign * (msg.linesRemoved || 0);
    hEntry.linesWritten += sign * (msg.linesWritten || 0);

    // Tool cost attribution: distribute message cost/tokens proportionally across tools
    const toolCounts = msg.toolCounts || {};
    const totalToolCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0) || msg.tools.length;
    if (totalToolCalls > 0) {
      const costPerCall = cost / totalToolCalls;
      const tokensPerCall = totalTokens / totalToolCalls;
      const inputPerCall = msg.inputTokens / totalToolCalls;
      const outputPerCall = msg.outputTokens / totalToolCalls;
      const cacheReadPerCall = msg.cacheReadTokens / totalToolCalls;
      const cacheCreatePerCall = msg.cacheCreateTokens / totalToolCalls;

      // Daily tool cost tracking
      if (!this._toolCostDaily[date]) this._toolCostDaily[date] = {};

      const toolEntries = Object.keys(toolCounts).length > 0 ? Object.entries(toolCounts) : msg.tools.map(t => [t, 1]);
      for (const [toolName, callCount] of toolEntries) {
        // _toolStats
        if (!this._toolStats[toolName]) {
          this._toolStats[toolName] = { calls: 0, cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, messages: 0 };
        }
        const ts = this._toolStats[toolName];
        ts.calls += sign * callCount;
        ts.cost += sign * costPerCall * callCount;
        ts.tokens += sign * tokensPerCall * callCount;
        ts.inputTokens += sign * inputPerCall * callCount;
        ts.outputTokens += sign * outputPerCall * callCount;
        ts.cacheReadTokens += sign * cacheReadPerCall * callCount;
        ts.cacheCreateTokens += sign * cacheCreatePerCall * callCount;
        ts.messages += sign;

        // Daily tool cost
        this._toolCostDaily[date][toolName] = (this._toolCostDaily[date][toolName] || 0) + sign * costPerCall * callCount;

        // MCP server tracking
        const parsed = Aggregator.parseMcpTool(toolName);
        if (parsed.isMcp) {
          if (!this._mcpServers[parsed.server]) {
            this._mcpServers[parsed.server] = { tools: {}, totalCalls: 0, totalCost: 0, totalTokens: 0 };
          }
          const srv = this._mcpServers[parsed.server];
          if (!srv.tools[parsed.tool]) {
            srv.tools[parsed.tool] = { calls: 0, cost: 0, tokens: 0 };
          }
          srv.tools[parsed.tool].calls += sign * callCount;
          srv.tools[parsed.tool].cost += sign * costPerCall * callCount;
          srv.tools[parsed.tool].tokens += sign * tokensPerCall * callCount;
          srv.totalCalls += sign * callCount;
          srv.totalCost += sign * costPerCall * callCount;
          srv.totalTokens += sign * tokensPerCall * callCount;
        }
      }
    }

    // Sub-agent stats
    if (msg.isSubagent) {
      this._subagentStats.messages += sign;
      this._subagentStats.inputTokens += sign * msg.inputTokens;
      this._subagentStats.outputTokens += sign * msg.outputTokens;
      this._subagentStats.cacheReadTokens += sign * msg.cacheReadTokens;
      this._subagentStats.cacheCreateTokens += sign * msg.cacheCreateTokens;
      this._subagentStats.cost += sign * cost;
      if (!this._subagentDaily[date]) this._subagentDaily[date] = { messages: 0, tokens: 0, cost: 0 };
      this._subagentDaily[date].messages += sign;
      this._subagentDaily[date].tokens += sign * totalTokens;
      this._subagentDaily[date].cost += sign * cost;
    }
  }

  _addMessage(msg) {
    // Normalize stopReason: infer from tools when null/undefined
    if (!msg.stopReason) {
      msg.stopReason = (msg.tools && msg.tools.length > 0) ? 'tool_use' : 'end_turn';
    }

    // Backward compat: reconstruct toolCounts from tools array if missing
    if (!msg.toolCounts && msg.tools && msg.tools.length > 0) {
      msg.toolCounts = {};
      for (const t of msg.tools) {
        msg.toolCounts[t] = (msg.toolCounts[t] || 0) + 1;
      }
    }

    // Dedup: if this message ID was seen before, subtract old contribution first
    const existing = this._messageById.get(msg.id);
    if (existing) {
      this._applyDelta(existing, -1);
    }

    // Add new contribution
    this._applyDelta(msg, +1);
    this._messageById.set(msg.id, msg);
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

    // Compute per-type cost breakdown + collect in-period timestamps in one pass
    // Unified timeline avoids double-counting overlapping sessions and
    // multi-day sessions contributing their full history to a single day.
    let inputCost = 0, outputCost = 0, cacheReadCost = 0, cacheCreateCost = 0;
    const periodTimestamps = [];
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (msg.timestamp) periodTimestamps.push(msg.timestamp);
      const pricing = PRICING[msg.model] || { input: 3, output: 15, cacheRead: 0.30, cacheCreate: 3.75 };
      inputCost += (msg.inputTokens / 1_000_000) * pricing.input;
      outputCost += (msg.outputTokens / 1_000_000) * pricing.output;
      cacheReadCost += (msg.cacheReadTokens / 1_000_000) * pricing.cacheRead;
      cacheCreateCost += (msg.cacheCreateTokens / 1_000_000) * pricing.cacheCreate;
    }

    // Total active minutes from unified in-period timeline (bounded by wall-clock)
    const totalActiveMin = computeActiveMinutes(periodTimestamps);

    // Count days with actual activity (messages > 0) for avg-per-day calculation
    let activeDays = 0;
    for (const d of daily) {
      if (d.messages > 0) activeDays++;
    }
    const avgActiveMinPerDay = activeDays > 0 ? Math.round(totalActiveMin / activeDays) : 0;

    let totalLinesAdded = 0, totalLinesRemoved = 0, totalLinesWritten = 0;
    for (const d of daily) {
      totalLinesAdded += d.linesAdded;
      totalLinesRemoved += d.linesRemoved;
      totalLinesWritten += d.linesWritten;
    }

    const rateLimits = this.getRateLimits(from, to);

    return {
      totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheCreate,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheCreateTokens: totalCacheCreate,
      estimatedCost: Math.round(totalCost * 100) / 100,
      inputCost: Math.round(inputCost * 100) / 100,
      outputCost: Math.round(outputCost * 100) / 100,
      cacheReadCost: Math.round(cacheReadCost * 100) / 100,
      cacheCreateCost: Math.round(cacheCreateCost * 100) / 100,
      sessions: sessionSet.size,
      totalActiveMin,
      avgActiveMinPerDay,
      activeDays,
      messages: totalMessages,
      rateLimitHits: rateLimits.total,
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved,
      linesWritten: totalLinesWritten,
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
        sessions: data.sessions.size,
        rateLimitHits: this._rateLimits[date] || 0,
        linesAdded: data.linesAdded,
        linesRemoved: data.linesRemoved,
        linesWritten: data.linesWritten,
        toolCalls: data.toolCalls || 0,
        tools: data.tools || {}
      }));
  }

  getSessions(project, model, from, to) {
    return Object.entries(this._sessions)
      .filter(([_id, s]) => {
        if (project && s.project !== project) return false;
        if (model && !s.models.has(model)) return false;
        if (from && toLocalDate(s.lastTs) < from) return false;
        if (to && toLocalDate(s.firstTs) > to) return false;
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
        activeMin: computeActiveMinutes(s._timestamps),
        messages: s.messages,
        toolCalls: Object.values(s.tools).reduce((a, b) => a + b, 0),
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheReadTokens: s.cacheReadTokens,
        cacheCreateTokens: s.cacheCreateTokens,
        totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens,
        cost: Math.round(s.cost * 100) / 100,
        linesAdded: s.linesAdded,
        linesRemoved: s.linesRemoved,
        linesWritten: s.linesWritten
      }));
  }

  getActiveSessions(minutesAgo = 10) {
    const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    return Object.entries(this._sessions)
      .filter(([, s]) => s.lastTs >= cutoff)
      .sort(([, a], [, b]) => b.lastTs.localeCompare(a.lastTs))
      .map(([id, s]) => ({
        id,
        project: s.project,
        models: [...s.models].map(m => getModelLabel(m)),
        firstTs: s.firstTs,
        lastTs: s.lastTs,
        durationMin: Math.round((new Date(s.lastTs) - new Date(s.firstTs)) / 60000),
        activeMin: computeActiveMinutes(s._timestamps),
        messages: s.messages,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheReadTokens: s.cacheReadTokens,
        cacheCreateTokens: s.cacheCreateTokens,
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
      activeMin: computeActiveMinutes(s._timestamps),
      messages: s.messages,
      tools: s.tools,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheReadTokens: s.cacheReadTokens,
      cacheCreateTokens: s.cacheCreateTokens,
      totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens,
      cost: Math.round(s.cost * 100) / 100,
      linesAdded: s.linesAdded,
      linesRemoved: s.linesRemoved,
      linesWritten: s.linesWritten
    };
  }

  getProjects(from, to) {
    if (!from && !to) {
      return Object.entries(this._projects)
        .sort(([, a], [, b]) => (b.inputTokens + b.outputTokens + b.cacheReadTokens + b.cacheCreateTokens) - (a.inputTokens + a.outputTokens + a.cacheReadTokens + a.cacheCreateTokens))
        .map(([name, p]) => ({
          name,
          totalTokens: p.inputTokens + p.outputTokens + p.cacheReadTokens + p.cacheCreateTokens,
          inputTokens: p.inputTokens, outputTokens: p.outputTokens,
          cacheReadTokens: p.cacheReadTokens, cacheCreateTokens: p.cacheCreateTokens,
          cost: Math.round(p.cost * 100) / 100,
          messages: p.messages, sessions: p.sessions.size,
          linesAdded: p.linesAdded, linesRemoved: p.linesRemoved, linesWritten: p.linesWritten
        }));
    }
    const projects = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (!projects[msg.project]) {
        projects[msg.project] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0, sessions: new Set(), linesAdded: 0, linesRemoved: 0, linesWritten: 0 };
      }
      const p = projects[msg.project];
      p.inputTokens += msg.inputTokens;
      p.outputTokens += msg.outputTokens;
      p.cacheReadTokens += msg.cacheReadTokens;
      p.cacheCreateTokens += msg.cacheCreateTokens;
      p.cost += calculateCost(msg.model, msg);
      p.messages++;
      p.linesAdded += msg.linesAdded || 0;
      p.linesRemoved += msg.linesRemoved || 0;
      p.linesWritten += msg.linesWritten || 0;
      if (msg.sessionId) p.sessions.add(msg.sessionId);
    }
    return Object.entries(projects)
      .sort(([, a], [, b]) => (b.inputTokens + b.outputTokens + b.cacheReadTokens + b.cacheCreateTokens) - (a.inputTokens + a.outputTokens + a.cacheReadTokens + a.cacheCreateTokens))
      .map(([name, p]) => ({
        name,
        totalTokens: p.inputTokens + p.outputTokens + p.cacheReadTokens + p.cacheCreateTokens,
        inputTokens: p.inputTokens, outputTokens: p.outputTokens,
        cacheReadTokens: p.cacheReadTokens, cacheCreateTokens: p.cacheCreateTokens,
        cost: Math.round(p.cost * 100) / 100,
        messages: p.messages, sessions: p.sessions.size,
        linesAdded: p.linesAdded, linesRemoved: p.linesRemoved, linesWritten: p.linesWritten
      }));
  }


  getProjectDetail(name, from, to) {
    const sessions = this.getSessions(name, null, from, to);
    const models = {};
    const tools = {};
    const daily = {};
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreate = 0;
    let totalCost = 0, totalMessages = 0, totalLinesAdded = 0, totalLinesRemoved = 0, totalLinesWritten = 0;
    let firstTs = null, lastTs = null;

    for (const msg of this.messages) {
      if (msg.project !== name) continue;
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;

      totalInput += msg.inputTokens;
      totalOutput += msg.outputTokens;
      totalCacheRead += msg.cacheReadTokens;
      totalCacheCreate += msg.cacheCreateTokens;
      totalCost += calculateCost(msg.model, msg);
      totalMessages++;
      totalLinesAdded += msg.linesAdded || 0;
      totalLinesRemoved += msg.linesRemoved || 0;
      totalLinesWritten += msg.linesWritten || 0;

      if (!firstTs || msg.timestamp < firstTs) firstTs = msg.timestamp;
      if (!lastTs || msg.timestamp > lastTs) lastTs = msg.timestamp;

      // Models
      if (!models[msg.model]) models[msg.model] = { messages: 0, tokens: 0, cost: 0 };
      const md = models[msg.model];
      md.messages++;
      md.tokens += msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
      md.cost += calculateCost(msg.model, msg);

      // Tools
      for (const t of (msg.tools || [])) {
        tools[t] = (tools[t] || 0) + 1;
      }

      // Daily
      if (!daily[date]) daily[date] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0, linesAdded: 0, linesRemoved: 0, linesWritten: 0 };
      const dd = daily[date];
      dd.inputTokens += msg.inputTokens;
      dd.outputTokens += msg.outputTokens;
      dd.cacheReadTokens += msg.cacheReadTokens;
      dd.cacheCreateTokens += msg.cacheCreateTokens;
      dd.cost += calculateCost(msg.model, msg);
      dd.messages++;
      dd.linesAdded += msg.linesAdded || 0;
      dd.linesRemoved += msg.linesRemoved || 0;
      dd.linesWritten += msg.linesWritten || 0;
    }

    const totalDurationMin = sessions.reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const totalActiveMin = sessions.reduce((sum, s) => sum + (s.activeMin || 0), 0);

    return {
      name,
      totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheCreate,
      inputTokens: totalInput, outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead, cacheCreateTokens: totalCacheCreate,
      cost: Math.round(totalCost * 100) / 100,
      messages: totalMessages,
      sessions: sessions.length,
      linesAdded: totalLinesAdded, linesRemoved: totalLinesRemoved, linesWritten: totalLinesWritten,
      firstTs, lastTs, totalDurationMin, totalActiveMin,
      models: Object.entries(models)
        .sort(([, a], [, b]) => b.tokens - a.tokens)
        .map(([m, d]) => ({ name: getModelLabel(m), messages: d.messages, tokens: d.tokens, cost: Math.round(d.cost * 100) / 100 })),
      tools: Object.entries(tools)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([name, calls]) => ({ name, calls })),
      daily: Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, ...d, cost: Math.round(d.cost * 100) / 100 })),
      sessionList: sessions.slice(0, 50)
    };
  }

  getModels(from, to) {
    if (!from && !to) {
      return Object.entries(this._models)
        .filter(([model]) => model !== '<synthetic>')
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([model, m]) => ({
          model, label: getModelLabel(model),
          inputTokens: m.inputTokens, outputTokens: m.outputTokens,
          cacheReadTokens: m.cacheReadTokens, cacheCreateTokens: m.cacheCreateTokens,
          totalTokens: m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreateTokens,
          cost: Math.round(m.cost * 100) / 100, messages: m.messages
        }));
    }
    const models = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (msg.model === '<synthetic>') continue;
      if (!models[msg.model]) {
        models[msg.model] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0 };
      }
      const m = models[msg.model];
      m.inputTokens += msg.inputTokens;
      m.outputTokens += msg.outputTokens;
      m.cacheReadTokens += msg.cacheReadTokens;
      m.cacheCreateTokens += msg.cacheCreateTokens;
      m.cost += calculateCost(msg.model, msg);
      m.messages++;
    }
    return Object.entries(models)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .map(([model, m]) => ({
        model, label: getModelLabel(model),
        inputTokens: m.inputTokens, outputTokens: m.outputTokens,
        cacheReadTokens: m.cacheReadTokens, cacheCreateTokens: m.cacheCreateTokens,
        totalTokens: m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreateTokens,
        cost: Math.round(m.cost * 100) / 100, messages: m.messages
      }));
  }

  getTools(from, to) {
    if (!from && !to) {
      const total = Object.values(this._tools).reduce((a, b) => a + b, 0);
      return Object.entries(this._tools)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => ({
          name, count,
          percentage: Math.round(count / total * 1000) / 10
        }));
    }
    const tools = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      for (const t of msg.tools) {
        tools[t] = (tools[t] || 0) + 1;
      }
    }
    const total = Object.values(tools).reduce((a, b) => a + b, 0);
    return Object.entries(tools)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({
        name, count,
        percentage: total > 0 ? Math.round(count / total * 1000) / 10 : 0
      }));
  }

  getToolStats(from, to) {
    if (!from && !to) {
      const totalCalls = Object.values(this._toolStats).reduce((a, t) => a + t.calls, 0);
      return Object.entries(this._toolStats)
        .filter(([, t]) => t.calls > 0)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([name, t]) => {
          const parsed = Aggregator.parseMcpTool(name);
          return {
            name, displayName: parsed.displayName, type: parsed.isMcp ? 'mcp' : 'built-in',
            server: parsed.server,
            calls: t.calls, cost: Math.round(t.cost * 100) / 100,
            tokens: Math.round(t.tokens), inputTokens: Math.round(t.inputTokens),
            outputTokens: Math.round(t.outputTokens), cacheReadTokens: Math.round(t.cacheReadTokens),
            cacheCreateTokens: Math.round(t.cacheCreateTokens), messages: t.messages,
            percentage: totalCalls > 0 ? Math.round(t.calls / totalCalls * 1000) / 10 : 0
          };
        });
    }
    // With date filter: recompute from messages
    const toolStats = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      const cost = calculateCost(msg.model, msg);
      const tc = msg.toolCounts || {};
      const totalCalls = Object.values(tc).reduce((a, b) => a + b, 0) || msg.tools.length;
      if (totalCalls === 0) continue;
      const costPerCall = cost / totalCalls;
      const totalTokens = msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
      const tokensPerCall = totalTokens / totalCalls;
      const entries = Object.keys(tc).length > 0 ? Object.entries(tc) : msg.tools.map(t => [t, 1]);
      for (const [name, count] of entries) {
        if (!toolStats[name]) toolStats[name] = { calls: 0, cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, messages: 0 };
        const ts = toolStats[name];
        ts.calls += count;
        ts.cost += costPerCall * count;
        ts.tokens += tokensPerCall * count;
        ts.inputTokens += (msg.inputTokens / totalCalls) * count;
        ts.outputTokens += (msg.outputTokens / totalCalls) * count;
        ts.cacheReadTokens += (msg.cacheReadTokens / totalCalls) * count;
        ts.cacheCreateTokens += (msg.cacheCreateTokens / totalCalls) * count;
        ts.messages++;
      }
    }
    const totalCalls = Object.values(toolStats).reduce((a, t) => a + t.calls, 0);
    return Object.entries(toolStats)
      .filter(([, t]) => t.calls > 0)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .map(([name, t]) => {
        const parsed = Aggregator.parseMcpTool(name);
        return {
          name, displayName: parsed.displayName, type: parsed.isMcp ? 'mcp' : 'built-in',
          server: parsed.server,
          calls: t.calls, cost: Math.round(t.cost * 100) / 100,
          tokens: Math.round(t.tokens), inputTokens: Math.round(t.inputTokens),
          outputTokens: Math.round(t.outputTokens), cacheReadTokens: Math.round(t.cacheReadTokens),
          cacheCreateTokens: Math.round(t.cacheCreateTokens), messages: t.messages,
          percentage: totalCalls > 0 ? Math.round(t.calls / totalCalls * 1000) / 10 : 0
        };
      });
  }

  getMcpServers(from, to) {
    if (!from && !to) {
      return Object.entries(this._mcpServers)
        .filter(([, s]) => s.totalCalls > 0)
        .sort(([, a], [, b]) => b.totalCost - a.totalCost)
        .map(([name, s]) => ({
          name,
          totalCalls: s.totalCalls,
          totalCost: Math.round(s.totalCost * 100) / 100,
          totalTokens: Math.round(s.totalTokens),
          tools: Object.entries(s.tools)
            .filter(([, t]) => t.calls > 0)
            .sort(([, a], [, b]) => b.calls - a.calls)
            .map(([toolName, t]) => ({
              name: toolName, calls: t.calls,
              cost: Math.round(t.cost * 100) / 100,
              tokens: Math.round(t.tokens)
            }))
        }));
    }
    // Recompute from toolStats
    const servers = {};
    const toolStats = this.getToolStats(from, to);
    for (const t of toolStats) {
      if (t.type !== 'mcp') continue;
      if (!servers[t.server]) servers[t.server] = { totalCalls: 0, totalCost: 0, totalTokens: 0, tools: [] };
      servers[t.server].totalCalls += t.calls;
      servers[t.server].totalCost += t.cost;
      servers[t.server].totalTokens += t.tokens;
      servers[t.server].tools.push({ name: t.displayName, calls: t.calls, cost: t.cost, tokens: t.tokens });
    }
    return Object.entries(servers)
      .sort(([, a], [, b]) => b.totalCost - a.totalCost)
      .map(([name, s]) => ({ name, ...s }));
  }

  getSubagentStats(from, to) {
    if (!from && !to) {
      const totalTokens = this._subagentStats.inputTokens + this._subagentStats.outputTokens + this._subagentStats.cacheReadTokens + this._subagentStats.cacheCreateTokens;
      const allMessages = this._messageById.size;
      const allCost = Object.values(this._models).reduce((a, m) => a + m.cost, 0);
      return {
        messages: this._subagentStats.messages,
        tokens: totalTokens,
        cost: Math.round(this._subagentStats.cost * 100) / 100,
        pctMessages: allMessages > 0 ? Math.round(this._subagentStats.messages / allMessages * 1000) / 10 : 0,
        pctCost: allCost > 0 ? Math.round(this._subagentStats.cost / allCost * 1000) / 10 : 0,
        daily: Object.entries(this._subagentDaily)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, d]) => ({ date, messages: d.messages, tokens: d.tokens, cost: Math.round(d.cost * 100) / 100 }))
      };
    }
    // Recompute from messages
    let messages = 0, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreateTokens = 0, subCost = 0;
    let allMessages = 0, allCost = 0;
    const daily = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      const cost = calculateCost(msg.model, msg);
      allMessages++;
      allCost += cost;
      if (msg.isSubagent) {
        messages++;
        inputTokens += msg.inputTokens;
        outputTokens += msg.outputTokens;
        cacheReadTokens += msg.cacheReadTokens;
        cacheCreateTokens += msg.cacheCreateTokens;
        subCost += cost;
        if (!daily[date]) daily[date] = { messages: 0, tokens: 0, cost: 0 };
        daily[date].messages++;
        daily[date].tokens += msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
        daily[date].cost += cost;
      }
    }
    return {
      messages,
      tokens: inputTokens + outputTokens + cacheReadTokens + cacheCreateTokens,
      cost: Math.round(subCost * 100) / 100,
      pctMessages: allMessages > 0 ? Math.round(messages / allMessages * 1000) / 10 : 0,
      pctCost: allCost > 0 ? Math.round(subCost / allCost * 1000) / 10 : 0,
      daily: Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, messages: d.messages, tokens: d.tokens, cost: Math.round(d.cost * 100) / 100 }))
    };
  }

  getToolCostDaily(from, to) {
    if (!from && !to) {
      return Object.entries(this._toolCostDaily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tools]) => ({ date, ...tools }));
    }
    // Recompute from messages
    const daily = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      const cost = calculateCost(msg.model, msg);
      const tc = msg.toolCounts || {};
      const totalCalls = Object.values(tc).reduce((a, b) => a + b, 0) || msg.tools.length;
      if (totalCalls === 0) continue;
      const costPerCall = cost / totalCalls;
      if (!daily[date]) daily[date] = {};
      const entries = Object.keys(tc).length > 0 ? Object.entries(tc) : msg.tools.map(t => [t, 1]);
      for (const [name, count] of entries) {
        daily[date][name] = (daily[date][name] || 0) + costPerCall * count;
      }
    }
    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tools]) => ({ date, ...tools }));
  }

  getHourly(from, to) {
    const empty = {
      tokens: 0, messages: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0,
      cost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheCreateCost: 0,
      linesAdded: 0, linesRemoved: 0, linesWritten: 0
    };
    if (!from && !to) {
      const result = [];
      for (let h = 0; h < 24; h++) {
        const data = this._hourly[h] || empty;
        result.push({
          hour: h, tokens: data.tokens, messages: data.messages,
          inputTokens: data.inputTokens, outputTokens: data.outputTokens,
          cacheReadTokens: data.cacheReadTokens, cacheCreateTokens: data.cacheCreateTokens,
          cost: Math.round(data.cost * 100) / 100,
          inputCost: Math.round(data.inputCost * 100) / 100,
          outputCost: Math.round(data.outputCost * 100) / 100,
          cacheReadCost: Math.round(data.cacheReadCost * 100) / 100,
          cacheCreateCost: Math.round(data.cacheCreateCost * 100) / 100,
          linesAdded: data.linesAdded, linesRemoved: data.linesRemoved, linesWritten: data.linesWritten
        });
      }
      return result;
    }
    const hourly = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      const hour = msg.timestamp ? new Date(msg.timestamp).getHours() : 0;
      if (!hourly[hour]) hourly[hour] = {
        tokens: 0, messages: 0,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0,
        cost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheCreateCost: 0,
        linesAdded: 0, linesRemoved: 0, linesWritten: 0
      };
      const hd = hourly[hour];
      hd.tokens += msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
      hd.messages++;
      hd.inputTokens += msg.inputTokens;
      hd.outputTokens += msg.outputTokens;
      hd.cacheReadTokens += msg.cacheReadTokens;
      hd.cacheCreateTokens += msg.cacheCreateTokens;
      const hCost = calculateCost(msg.model, msg);
      hd.cost += hCost;
      const hPricing = PRICING[msg.model] || { input: 3, output: 15, cacheRead: 0.30, cacheCreate: 3.75 };
      hd.inputCost += (msg.inputTokens / 1_000_000) * hPricing.input;
      hd.outputCost += (msg.outputTokens / 1_000_000) * hPricing.output;
      hd.cacheReadCost += (msg.cacheReadTokens / 1_000_000) * hPricing.cacheRead;
      hd.cacheCreateCost += (msg.cacheCreateTokens / 1_000_000) * hPricing.cacheCreate;
      hd.linesAdded += msg.linesAdded || 0;
      hd.linesRemoved += msg.linesRemoved || 0;
      hd.linesWritten += msg.linesWritten || 0;
    }
    const result = [];
    for (let h = 0; h < 24; h++) {
      const data = hourly[h] || empty;
      result.push({
        hour: h, tokens: data.tokens, messages: data.messages,
        inputTokens: data.inputTokens, outputTokens: data.outputTokens,
        cacheReadTokens: data.cacheReadTokens, cacheCreateTokens: data.cacheCreateTokens,
        cost: Math.round(data.cost * 100) / 100,
        inputCost: Math.round(data.inputCost * 100) / 100,
        outputCost: Math.round(data.outputCost * 100) / 100,
        cacheReadCost: Math.round(data.cacheReadCost * 100) / 100,
        cacheCreateCost: Math.round(data.cacheCreateCost * 100) / 100,
        linesAdded: data.linesAdded, linesRemoved: data.linesRemoved, linesWritten: data.linesWritten
      });
    }
    return result;
  }

  getDailyByModel(from, to) {
    const daily = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
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

  getHourlyByModel(from, to) {
    const hourly = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      const hour = msg.timestamp ? new Date(msg.timestamp).getHours() : 0;
      if (!hourly[hour]) hourly[hour] = {};
      const model = getModelLabel(msg.model);
      if (!hourly[hour][model]) hourly[hour][model] = 0;
      hourly[hour][model] += msg.inputTokens + msg.outputTokens + msg.cacheReadTokens + msg.cacheCreateTokens;
    }
    const result = [];
    for (let h = 0; h < 24; h++) {
      result.push({ date: String(h).padStart(2, '0') + ':00', ...(hourly[h] || {}) });
    }
    return result;
  }

  // --- Insights methods ---

  /** Distribution of stop reasons */
  getStopReasons(from, to) {
    const counts = {};
    for (const msg of this.messages) {
      if (from || to) {
        const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
        if ((from && date < from) || (to && date > to)) continue;
      }
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
  getDayOfWeek(from, to) {
    const days = Array.from({ length: 7 }, () => ({ tokens: 0, messages: 0, cost: 0 }));
    for (const msg of this.messages) {
      if (!msg.timestamp) continue;
      if (from || to) {
        const date = toLocalDate(msg.timestamp);
        if ((from && date < from) || (to && date > to)) continue;
      }
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
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
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
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
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
  getSessionEfficiency(from, to) {
    return Object.entries(this._sessions)
      .filter(([, s]) => {
        if (s.messages <= 0) return false;
        if (from && toLocalDate(s.lastTs) < from) return false;
        if (to && toLocalDate(s.firstTs) > to) return false;
        return true;
      })
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

  /** Productivity/efficiency metrics derived from existing data */
  getProductivity(from, to) {
    const daily = this.getDaily(from, to);
    const sessions = this.getSessions(null, null, from, to);
    const stopReasons = this.getStopReasons(from, to);

    // Total session time in minutes — cap durations to the [from, to] range
    let totalSessionMinutes;
    if (from || to) {
      const rangeStart = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
      const rangeEnd = to ? new Date(to + 'T23:59:59.999').getTime() : Infinity;
      totalSessionMinutes = 0;
      for (const s of sessions) {
        const sessStart = new Date(s.firstTs).getTime();
        const sessEnd = new Date(s.lastTs).getTime();
        const effectiveStart = Math.max(sessStart, rangeStart);
        const effectiveEnd = Math.min(sessEnd, rangeEnd);
        if (effectiveEnd > effectiveStart) {
          totalSessionMinutes += (effectiveEnd - effectiveStart) / 60000;
        }
      }
      totalSessionMinutes = Math.round(totalSessionMinutes);
    } else {
      totalSessionMinutes = sessions.reduce((sum, s) => sum + (s.durationMin || 0), 0);
    }
    const totalSessionHours = totalSessionMinutes / 60;

    // Total tokens
    let totalOutput = 0, totalInput = 0, totalCacheRead = 0;
    let totalMessages = 0, totalToolCalls = 0;
    let totalLinesWritten = 0, totalLinesAdded = 0;
    let totalCost = 0;
    for (const d of daily) {
      totalOutput += d.outputTokens;
      totalInput += d.inputTokens;
      totalCacheRead += d.cacheReadTokens;
      totalMessages += d.messages;
      totalToolCalls += d.toolCalls || 0;
      totalLinesWritten += d.linesWritten || 0;
      totalLinesAdded += d.linesAdded || 0;
      totalCost += d.cost;
    }

    const totalLines = totalLinesWritten + totalLinesAdded;
    const sessionCount = sessions.length || 1;

    // Tokens per minute
    const tokensPerMin = totalSessionMinutes > 0
      ? Math.round(totalOutput / totalSessionMinutes)
      : 0;

    // Lines per hour
    const linesPerHour = totalSessionHours > 0
      ? Math.round(totalLines / totalSessionHours)
      : 0;

    // Messages per session
    const msgsPerSession = Math.round((totalMessages / sessionCount) * 10) / 10;

    // Cost per line
    const costPerLine = totalLines > 0
      ? Math.round((totalCost / totalLines) * 1000) / 1000
      : 0;

    // Cache savings: difference between what cache-read tokens would cost at input price vs cache price
    let cacheSavings = 0;
    for (const msg of this.messages) {
      if (from || to) {
        const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
        if ((from && date < from) || (to && date > to)) continue;
      }
      const pricing = PRICING[msg.model] || { input: 3, output: 15, cacheRead: 0.30, cacheCreate: 3.75 };
      const savedPerToken = (pricing.input - pricing.cacheRead) / 1_000_000;
      cacheSavings += msg.cacheReadTokens * savedPerToken;
    }
    cacheSavings = Math.round(cacheSavings * 100) / 100;

    // Code ratio: % of messages with stopReason='tool_use'
    const toolUseEntry = stopReasons.find(r => r.reason === 'tool_use');
    const codeRatio = toolUseEntry ? toolUseEntry.percentage : 0;

    // Trend: compare current period to previous equivalent period
    const trends = this._computeTrends(from, to);

    // Daily productivity for chart
    const dailyProductivity = daily.map(d => {
      // Compute session hours for this day from sessions
      const daySessions = sessions.filter(s => {
        const sDate = s.firstTs ? toLocalDate(new Date(s.firstTs)) : '';
        return sDate === d.date;
      });
      const dayHours = daySessions.reduce((sum, s) => sum + (s.durationMin || 0), 0) / 60;
      const dayLines = (d.linesWritten || 0) + (d.linesAdded || 0);
      return {
        date: d.date,
        linesPerHour: dayHours > 0 ? Math.round(dayLines / dayHours) : 0,
        costPerLine: dayLines > 0 ? Math.round(d.cost / dayLines * 1000) / 1000 : 0
      };
    });

    // New efficiency KPIs
    const tokensPerLine = totalLines > 0
      ? Math.round(totalOutput / totalLines)
      : 0;
    const toolsPerTurn = totalMessages > 0
      ? Math.round((totalToolCalls / totalMessages) * 10) / 10
      : 0;
    const linesPerTurn = totalMessages > 0
      ? Math.round((totalLines / totalMessages) * 10) / 10
      : 0;
    const ioRatio = totalInput > 0
      ? Math.round((totalOutput / totalInput) * 1000) / 10
      : 0;

    return {
      tokensPerMin,
      linesPerHour,
      msgsPerSession,
      costPerLine,
      cacheSavings,
      codeRatio,
      codingHours: Math.round(totalSessionHours * 10) / 10,
      totalLines,
      tokensPerLine,
      toolsPerTurn,
      linesPerTurn,
      ioRatio,
      trends,
      dailyProductivity,
      stopReasons
    };
  }

  /** Daily efficiency metrics with 7-day rolling averages */
  getEfficiencyTrend(from, to) {
    const daily = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (!daily[date]) daily[date] = { outputTokens: 0, inputTokens: 0, messages: 0, toolCalls: 0, linesAdded: 0, linesWritten: 0 };
      const d = daily[date];
      d.outputTokens += msg.outputTokens;
      d.inputTokens += msg.inputTokens;
      d.messages++;
      d.toolCalls += msg.tools.length;
      d.linesAdded += msg.linesAdded || 0;
      d.linesWritten += msg.linesWritten || 0;
    }

    const sorted = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b));
    const result = sorted.map(([date, d]) => {
      const lines = d.linesWritten + d.linesAdded;
      return {
        date,
        tokensPerLine: lines > 0 ? Math.round(d.outputTokens / lines) : 0,
        linesPerTurn: d.messages > 0 ? Math.round((lines / d.messages) * 10) / 10 : 0,
        toolsPerTurn: d.messages > 0 ? Math.round((d.toolCalls / d.messages) * 10) / 10 : 0,
        ioRatio: d.inputTokens > 0 ? Math.round((d.outputTokens / d.inputTokens) * 1000) / 10 : 0
      };
    });

    // Compute 7-day rolling averages
    const rolling = result.map((entry, i) => {
      const window = result.slice(Math.max(0, i - 6), i + 1);
      const avg = (field) => {
        const vals = window.filter(w => w[field] > 0).map(w => w[field]);
        return vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
      };
      return {
        date: entry.date,
        tokensPerLine: avg('tokensPerLine'),
        linesPerTurn: avg('linesPerTurn'),
        toolsPerTurn: avg('toolsPerTurn'),
        ioRatio: avg('ioRatio')
      };
    });

    return { daily: result, rolling };
  }

  /** Per-model efficiency comparison */
  getModelEfficiency(from, to) {
    const models = {};
    for (const msg of this.messages) {
      const date = msg.timestamp ? toLocalDate(msg.timestamp) : 'unknown';
      if ((from && date < from) || (to && date > to)) continue;
      if (msg.model === '<synthetic>') continue;
      if (!models[msg.model]) models[msg.model] = { outputTokens: 0, inputTokens: 0, messages: 0, toolCalls: 0, linesAdded: 0, linesWritten: 0, cost: 0 };
      const m = models[msg.model];
      m.outputTokens += msg.outputTokens;
      m.inputTokens += msg.inputTokens;
      m.messages++;
      m.toolCalls += msg.tools.length;
      m.linesAdded += msg.linesAdded || 0;
      m.linesWritten += msg.linesWritten || 0;
      m.cost += calculateCost(msg.model, msg);
    }

    return Object.entries(models)
      .filter(([, m]) => m.messages >= 5) // only models with meaningful data
      .map(([model, m]) => {
        const lines = m.linesWritten + m.linesAdded;
        return {
          model,
          label: getModelLabel(model),
          messages: m.messages,
          totalLines: lines,
          tokensPerLine: lines > 0 ? Math.round(m.outputTokens / lines) : 0,
          costPerLine: lines > 0 ? Math.round(m.cost / lines * 1000) / 1000 : 0,
          linesPerTurn: m.messages > 0 ? Math.round((lines / m.messages) * 10) / 10 : 0,
          toolsPerTurn: m.messages > 0 ? Math.round((m.toolCalls / m.messages) * 10) / 10 : 0,
          ioRatio: m.inputTokens > 0 ? Math.round((m.outputTokens / m.inputTokens) * 1000) / 10 : 0
        };
      })
      .sort((a, b) => b.messages - a.messages);
  }

  /** Session depth analysis — scatter data: messages vs efficiency */
  getSessionDepthAnalysis(from, to) {
    return Object.entries(this._sessions)
      .filter(([, s]) => {
        if (s.messages < 2) return false;
        if (from && toLocalDate(s.lastTs) < from) return false;
        if (to && toLocalDate(s.firstTs) > to) return false;
        return true;
      })
      .map(([id, s]) => {
        const lines = (s.linesWritten || 0) + (s.linesAdded || 0);
        const toolCalls = Object.values(s.tools).reduce((sum, c) => sum + c, 0);
        return {
          id,
          project: s.project,
          messages: s.messages,
          durationMin: Math.round((new Date(s.lastTs) - new Date(s.firstTs)) / 60000),
          totalLines: lines,
          tokensPerLine: lines > 0 ? Math.round(s.outputTokens / lines) : 0,
          costPerLine: lines > 0 ? Math.round(s.cost / lines * 1000) / 1000 : 0,
          linesPerTurn: s.messages > 0 ? Math.round((lines / s.messages) * 10) / 10 : 0,
          toolsPerTurn: s.messages > 0 ? Math.round((toolCalls / s.messages) * 10) / 10 : 0
        };
      })
      .filter(s => s.totalLines > 0)
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 100);
  }

  /** Compute trend percentages by comparing current period to previous equivalent period */
  _computeTrends(from, to) {
    if (!from) return {};
    const fromDate = new Date(from);
    const toDate = to ? new Date(to) : new Date();
    const daySpan = Math.round((toDate - fromDate) / 86400000) + 1;

    const prevTo = new Date(fromDate);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - daySpan + 1);

    const prevFromStr = toLocalDate(prevFrom);
    const prevToStr = toLocalDate(prevTo);

    const prevDaily = this.getDaily(prevFromStr, prevToStr);
    const prevSessions = this.getSessions(null, null, prevFromStr, prevToStr);

    let prevOutput = 0, prevLines = 0, prevCost = 0;
    const prevSessionMinutes = prevSessions.reduce((s, sess) => s + (sess.durationMin || 0), 0);
    for (const d of prevDaily) {
      prevOutput += d.outputTokens;
      prevLines += (d.linesWritten || 0) + (d.linesAdded || 0);
      prevCost += d.cost;
    }

    const curDaily = this.getDaily(from, to);
    const curSessions = this.getSessions(null, null, from, to);
    let curOutput = 0, curLines = 0, curCost = 0;
    const curSessionMinutes = curSessions.reduce((s, sess) => s + (sess.durationMin || 0), 0);
    for (const d of curDaily) {
      curOutput += d.outputTokens;
      curLines += (d.linesWritten || 0) + (d.linesAdded || 0);
      curCost += d.cost;
    }

    function pctChange(cur, prev) {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    }

    const curTokPerMin = curSessionMinutes > 0 ? curOutput / curSessionMinutes : 0;
    const prevTokPerMin = prevSessionMinutes > 0 ? prevOutput / prevSessionMinutes : 0;

    const curSessionHours = curSessionMinutes / 60;
    const prevSessionHours = prevSessionMinutes / 60;
    const curLinesPerHour = curSessionHours > 0 ? curLines / curSessionHours : 0;
    const prevLinesPerHour = prevSessionHours > 0 ? prevLines / prevSessionHours : 0;

    const curCostPerLine = curLines > 0 ? curCost / curLines : 0;
    const prevCostPerLine = prevLines > 0 ? prevCost / prevLines : 0;

    return {
      tokensPerMin: pctChange(curTokPerMin, prevTokPerMin),
      linesPerHour: pctChange(curLinesPerHour, prevLinesPerHour),
      costPerLine: pctChange(curCostPerLine, prevCostPerLine)
    };
  }
}

/**
 * Per-user aggregator cache for multi-user mode.
 * Lazy-loads aggregators per userId, evicts after 30 min inactivity.
 */
class AggregatorCache {
  constructor(getMessagesForUser, getRateLimitEventsForUser) {
    this._cache = new Map(); // "userId:deviceId" -> { aggregator, lastAccess, createdAt }
    this._getMessagesForUser = getMessagesForUser;
    this._getRateLimitEventsForUser = getRateLimitEventsForUser || null;
    this._evictionInterval = setInterval(() => this._evict(), 5 * 60 * 1000);
    this._maxAge = 2 * 60 * 60 * 1000; // Force full rebuild after 2 hours
  }

  _cacheKey(userId, deviceId) {
    return deviceId ? `${userId}:${deviceId}` : `${userId}:all`;
  }

  _buildEntry(userId, deviceId) {
    const agg = new Aggregator();
    const messages = this._getMessagesForUser(userId, deviceId || undefined);
    agg.addMessages(messages);
    if (this._getRateLimitEventsForUser) {
      const rleEvents = this._getRateLimitEventsForUser(userId, deviceId || undefined);
      agg.addRateLimitEvents(rleEvents);
    }
    return { aggregator: agg, lastAccess: Date.now(), createdAt: Date.now() };
  }

  get(userId, deviceId) {
    const key = this._cacheKey(userId, deviceId || null);
    let entry = this._cache.get(key);
    // Rebuild if missing or older than maxAge (guards against incremental drift)
    if (!entry || (Date.now() - entry.createdAt > this._maxAge)) {
      entry = this._buildEntry(userId, deviceId || null);
      this._cache.set(key, entry);
    }
    entry.lastAccess = Date.now();
    return entry.aggregator;
  }

  /**
   * Incrementally add messages/events to all cached aggregators for a user.
   * Avoids full rebuild from DB — O(newMessages) instead of O(allMessages).
   * Does NOT reset lastAccess — only user requests (get) keep the cache alive.
   */
  addToUser(userId, messages, rateLimitEvents) {
    for (const [key, entry] of this._cache) {
      if (key.startsWith(`${userId}:`)) {
        if (messages && messages.length > 0) entry.aggregator.addMessages(messages);
        if (rateLimitEvents && rateLimitEvents.length > 0) entry.aggregator.addRateLimitEvents(rateLimitEvents);
      }
    }
  }

  invalidateUser(userId) {
    for (const key of this._cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this._cache.delete(key);
      }
    }
  }

  _evict() {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [key, entry] of this._cache) {
      if (entry.lastAccess < cutoff) {
        this._cache.delete(key);
      }
    }
  }

  stop() {
    clearInterval(this._evictionInterval);
  }

  get size() {
    return this._cache.size;
  }
}

module.exports = Aggregator;
module.exports.AggregatorCache = AggregatorCache;
