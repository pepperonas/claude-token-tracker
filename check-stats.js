const agg = require('./lib/aggregator');
const rdb = require('better-sqlite3')('data/tracker.db', {readonly:true});
const msgs = rdb.prepare('SELECT * FROM messages').all();
const tools = rdb.prepare('SELECT * FROM message_tools').all();
const toolMap = {};
tools.forEach(t => {
  if (!toolMap[t.message_id]) toolMap[t.message_id] = [];
  toolMap[t.message_id].push({name: t.tool_name, calls: t.call_count});
});
msgs.forEach(m => { m.tools = toolMap[m.id] || []; });
agg.init(msgs, []);
const ach = require('./lib/achievements');
const stats = ach.buildStats(agg);
const keys = Object.keys(stats).sort();
keys.forEach(k => {
  const v = stats[k];
  if (v instanceof Set) console.log(k + ': Set(' + v.size + ') = ' + [...v].slice(0,15).join(', '));
  else if (Array.isArray(v)) console.log(k + ': Array(' + v.length + ') = ' + JSON.stringify(v.slice(0,5)));
  else console.log(k + ': ' + v);
});
rdb.close();
