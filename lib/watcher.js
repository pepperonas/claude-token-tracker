const chokidar = require('chokidar');
const { PROJECTS_DIR } = require('./config');
const { parseIncremental } = require('./parser');

class Watcher {
  constructor(aggregator, parseState, onUpdate) {
    this.aggregator = aggregator;
    this.parseState = parseState;
    this.onUpdate = onUpdate;
    this.watcher = null;
    this.sseClients = new Set();
  }

  start() {
    this.watcher = chokidar.watch(PROJECTS_DIR, {
      ignored: [/(^|[\/\\])\../, /subagents/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
    });

    this.watcher.on('change', (filePath) => {
      if (!filePath.endsWith('.jsonl')) return;
      if (filePath.includes('/subagents/')) return;

      try {
        const newMessages = parseIncremental(filePath, this.parseState);
        if (newMessages.length > 0) {
          this.aggregator.addMessages(newMessages);
          this.broadcast({ type: 'update', count: newMessages.length });
          if (this.onUpdate) this.onUpdate(newMessages);
        }
      } catch (err) {
        console.error(`Error parsing ${filePath}:`, err.message);
      }
    });

    this.watcher.on('add', (filePath) => {
      if (!filePath.endsWith('.jsonl')) return;
      if (filePath.includes('/subagents/')) return;

      try {
        const newMessages = parseIncremental(filePath, this.parseState);
        if (newMessages.length > 0) {
          this.aggregator.addMessages(newMessages);
          this.broadcast({ type: 'new-session', count: newMessages.length });
          if (this.onUpdate) this.onUpdate(newMessages);
        }
      } catch (err) {
        console.error(`Error parsing new file ${filePath}:`, err.message);
      }
    });

    console.log('File watcher started on', PROJECTS_DIR);
  }

  addSSEClient(res) {
    this.sseClients.add(res);
    res.on('close', () => this.sseClients.delete(res));
  }

  broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      // In multi-user mode, only send to the targeted user (or to all if no userId in data)
      if (data.userId && client._userId && client._userId !== data.userId) continue;
      try { client.write(payload); } catch (_e) { this.sseClients.delete(client); }
    }
  }

  stop() {
    if (this.watcher) this.watcher.close();
  }
}

module.exports = Watcher;
