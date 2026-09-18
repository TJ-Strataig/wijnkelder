import { HttpError, uuid } from './util.js';

// D1 batch is a transaction. A conditional claim and its token gate every write;
// losing a race does not execute any dependent writes or leave a pending claim.
export function mutation(env, { claim, guard = '1', bindings = [], conflict = 'De gegevens zijn intussen gewijzigd. Vernieuw de pagina.' } = {}) {
  const statements = claim ? [claim] : [];
  const writes = {
    insert(table, fields) {
      const columns = Object.keys(fields);
      statements.push(env.DB.prepare(`INSERT INTO ${table} (${columns.join(', ')}) SELECT ${columns.map(() => '?').join(', ')} WHERE ${guard}`)
        .bind(...Object.values(fields), ...bindings));
    },
    update(table, fields, where, values = []) {
      statements.push(env.DB.prepare(`UPDATE ${table} SET ${Object.keys(fields).map((k) => `${k} = ?`).join(', ')} WHERE (${where}) AND (${guard})`)
        .bind(...Object.values(fields), ...values, ...bindings));
      return statements.length - 1;
    },
    delete(table, where, values = []) {
      statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE (${where}) AND (${guard})`).bind(...values, ...bindings));
    },
    activity(user, action, entity, id, details = null) {
      writes.insert('activity', { id: uuid(), user_id: user.id, action, entity, entity_id: id, details: details === null ? null : JSON.stringify(details) });
    },
    async commit() {
      const results = await env.DB.batch(statements);
      if (claim && results[0].meta.changes !== 1) throw new HttpError(409, conflict);
      return results;
    },
  };
  return writes;
}
