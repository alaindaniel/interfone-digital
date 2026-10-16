const fs = require('fs');
const path = require('path');
const config = require('../config');
const supabaseClient = require('./supabaseClient');

const dataDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const defaultSchema = {
  organizations: [],
  access_points: [],
  qr_codes: [],
  properties: [],
  users: [],
  resident_properties: [],
  devices: [],
  calls: [],
  call_participants: [],
  audit_logs: [],
  settings: []
};

class Database {
  constructor() {
    this.filePath = config.DB_PATH;
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...defaultSchema, ...parsed };
      }
    } catch (err) {
      console.error('Error loading database file, initializing defaults:', err.message);
    }
    return JSON.parse(JSON.stringify(defaultSchema));
  }

  save() {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('Error saving database:', err.message);
    }
  }

  async init() {
    if (!supabaseClient.isConfigured()) return;
    try {
      console.log('[DATABASE] Sincronizando com Supabase...');
      const tables = Object.keys(defaultSchema);
      for (const table of tables) {
        try {
          const { data, error } = await supabaseClient.supabase.from(table).select('*');
          if (error) {
            console.warn(`[DATABASE] Aviso ao buscar tabela '${table}' no Supabase:`, error.message);
          } else if (data && data.length > 0) {
            this.data[table] = data.map(row => supabaseClient.toCamelCase(row, table));
            console.log(`[DATABASE] Tabela '${table}' carregada com ${data.length} registro(s) do Supabase.`);
          }
        } catch (tableErr) {
          console.warn(`[DATABASE] Falha ao consultar tabela '${table}':`, tableErr.message);
        }
      }
      this.save();
      console.log('[DATABASE] Sincronização com Supabase concluída!');
    } catch (err) {
      console.error('[DATABASE] Erro ao sincronizar com Supabase:', err.message);
    }
  }

  // Generic query operations
  getTable(table) {
    if (!this.data[table]) {
      this.data[table] = [];
    }
    return this.data[table];
  }

  find(table, predicate = () => true) {
    const list = this.getTable(table);
    if (typeof predicate === 'function') {
      return list.filter(predicate);
    }
    return list.filter(item => {
      for (const [k, v] of Object.entries(predicate)) {
        if (item[k] !== v) return false;
      }
      return true;
    });
  }

  findOne(table, predicate) {
    const results = this.find(table, predicate);
    return results.length > 0 ? results[0] : null;
  }

  findById(table, id) {
    return this.findOne(table, { id });
  }

  insert(table, record) {
    const list = this.getTable(table);
    const newRecord = {
      ...record,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(newRecord);
    this.save();

    if (supabaseClient.isConfigured()) {
      supabaseClient.supabase
        .from(table)
        .upsert(supabaseClient.toSnakeCase(newRecord, table))
        .then(({ error }) => {
          if (error) console.error(`[SUPABASE] Erro no upsert na tabela '${table}':`, error.message);
        })
        .catch(err => console.error(`[SUPABASE] Falha ao persistir em '${table}':`, err.message));
    }

    return newRecord;
  }

  update(table, id, updates) {
    const list = this.getTable(table);
    const index = list.findIndex(item => item.id === id);
    if (index === -1) return null;

    list[index] = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();

    if (supabaseClient.isConfigured()) {
      supabaseClient.supabase
        .from(table)
        .update(supabaseClient.toSnakeCase({ ...updates, updatedAt: list[index].updatedAt }, table))
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error(`[SUPABASE] Erro no update na tabela '${table}':`, error.message);
        })
        .catch(err => console.error(`[SUPABASE] Falha ao atualizar '${table}':`, err.message));
    }

    return list[index];
  }

  delete(table, id) {
    const list = this.getTable(table);
    const index = list.findIndex(item => item.id === id);
    if (index === -1) return false;

    list.splice(index, 1);
    this.save();

    if (supabaseClient.isConfigured()) {
      supabaseClient.supabase
        .from(table)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error(`[SUPABASE] Erro ao deletar em '${table}':`, error.message);
        })
        .catch(err => console.error(`[SUPABASE] Falha ao deletar em '${table}':`, err.message));
    }

    return true;
  }

  deleteWhere(table, predicate) {
    const list = this.getTable(table);
    const toDelete = list.filter(predicate);
    const initialLen = list.length;
    this.data[table] = list.filter(item => !predicate(item));
    this.save();

    if (supabaseClient.isConfigured() && toDelete.length > 0) {
      const ids = toDelete.map(item => item.id).filter(Boolean);
      if (ids.length > 0) {
        supabaseClient.supabase
          .from(table)
          .delete()
          .in('id', ids)
          .catch(err => console.error(`[SUPABASE] Falha em deleteWhere na tabela '${table}':`, err.message));
      }
    }

    return initialLen - this.data[table].length;
  }

  clear() {
    this.data = JSON.parse(JSON.stringify(defaultSchema));
    this.save();
  }
}

const db = new Database();
module.exports = db;
