/* eslint-disable @typescript-eslint/prefer-for-of */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable object-shorthand */
import { Database, default as sqlite3InitModule } from '@sqlite.org/sqlite-wasm';

interface ISqliteData {
  type: 'init' | 'executeSql' | 'batchSql' | 'batchReturnSql' | 'export';
  id: string;
  flags: string;
  filename: string;
  error: any;
  sql: string;
  param: any;
  sqls: any;
  db: string;
  rows: any;
  rowsAffected: number;
}

const dbs: { [property: string]: Database } = {};

const log = (...args) => console.log(...args);
const error = (...args) => console.error(...args);

self.onmessage = async (messageEvent: MessageEvent) => {
  const sqliteMessage = messageEvent.data as ISqliteData;

  const stringifyParamObjects = (arr: (string | number)[]): void => {
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'number' && typeof arr[i] !== 'string') {
        arr[i] = String(arr[i]);
      }
    }
  };

  /**************************** INIT ************************/
  if (sqliteMessage.type === 'init') {
    try {
      if (dbs[sqliteMessage.filename]) {
        throw new Error('The database has already been initialized');
      }
      sqlite3InitModule({
        print: log,
        printErr: error,
      }).then((sqlite3) => {
        try {
          debugger
          dbs[sqliteMessage.filename] = new sqlite3.oo1.OpfsDb(sqliteMessage.filename, sqliteMessage.flags);
        } catch (err) {
          debugger
          sqliteMessage.error = err;
        } finally {
          debugger
          self.postMessage(sqliteMessage);
        }
      });
    } catch (err) {
      sqliteMessage.error = err;
      self.postMessage(sqliteMessage);
    }
  }

  /********************* EXECUTE_SQL  *********************/
  if (sqliteMessage.type === 'executeSql') {
    try {
      if (!dbs[sqliteMessage.filename]) {
        throw new Error('Initialize the database before performing queries');
      }
      const values: any = [];
      if (!sqliteMessage.param) {
        sqliteMessage.param = [];
      }
      stringifyParamObjects(sqliteMessage.param);
      dbs[sqliteMessage.filename].exec({
        sql: sqliteMessage.sql,
        bind: sqliteMessage.param,
        rowMode: 'object',
        callback: (row) => {
          values.push(row);
        }
      });
      sqliteMessage.rows = values;
    } catch (e) {
      sqliteMessage.error = e;
    } finally {
      self.postMessage(sqliteMessage);
    }
  }

  /************************ BATCH ************************/
  if (sqliteMessage.type === 'batchSql') {
    try {
      if (!dbs[sqliteMessage.filename]) {
        throw new Error('Initialize the database before performing queries');
      }
      dbs[sqliteMessage.filename].exec('BEGIN TRANSACTION');
      let changes = 0;
      sqliteMessage.sqls.forEach(([sql, param]) => {
        if (!param) {
          param = [];
        }
        stringifyParamObjects(param);
        dbs[sqliteMessage.filename].exec({ sql: sql, bind: param });
        changes += dbs[sqliteMessage.filename].changes();
      });
      dbs[sqliteMessage.filename].exec('COMMIT');
      sqliteMessage.rowsAffected = changes;
      /*
      let changes = 0;
      db.exec('BEGIN TRANSACTION');
      sqliteMessage.sqls.forEach(([sql, param]) => {
        if (!param) {
          console.log(sql);
          param = [];
        }
        db.exec(sql, param);
      });
      db.exec('COMMIT');
      changes += db.changes();

      let changes = 0;
      sqliteMessage.sqls.forEach(([sql, param]) => {
        if (!param) {
          console.log(sql);
          param = [];
        }
        const stmt = db.prepare(sql);
        !param.length || stmt.bind(param);
        stmt.step();
        changes += db.changes();
      }); */
    } catch (e) {
      dbs[sqliteMessage.filename].exec('ROLLBACK');
      sqliteMessage.error = e;
    } finally {
      self.postMessage(sqliteMessage);
    }
  }

  /****************** BATCH_RETURN ******************/
  if (sqliteMessage.type === 'batchReturnSql') {
    try {
      if (!dbs[sqliteMessage.filename]) {
        throw new Error('Initialize the database before performing queries');
      }
      
      dbs[sqliteMessage.filename].exec('BEGIN TRANSACTION');
      
      const batchResults: any[] = [];
      
      sqliteMessage.sqls.forEach(([sql, param]) => {
        if (!param) {
          param = [];
        }
        stringifyParamObjects(param);

        const currentQueryRows: any[] = [];
        
        dbs[sqliteMessage.filename].exec({
          sql: sql,
          bind: param,
          rowMode: 'object',
          callback: (row) => {
            currentQueryRows.push(row);
          }
        });
        
        batchResults.push(currentQueryRows);
      });

      dbs[sqliteMessage.filename].exec('COMMIT');
      sqliteMessage.rows = batchResults;

    } catch (e) {
      dbs[sqliteMessage.filename].exec('ROLLBACK');
      sqliteMessage.error = e;
    } finally {
      self.postMessage(sqliteMessage);
    }
  }

  /********************* EXPORT *********************/
  if (sqliteMessage.type === 'export') {
    debugger
    try {
      if (!dbs[sqliteMessage.filename]) {
        throw new Error('Database not initialized');
      }

      // 1. Force all data from WAL into the main DB file
      dbs[sqliteMessage.filename].exec('PRAGMA wal_checkpoint(FULL)');

      // 2. Access the file directly from OPFS
      // @ts-ignore - Typescript might not know about getDirectory yet
      const root = await navigator.storage.getDirectory();
      
      // Remove leading '/' from '/dbname.sqlite3' to match OPFS file name
      const cleanFilename = sqliteMessage.filename.startsWith('/') 
        ? sqliteMessage.filename.slice(1) 
        : sqliteMessage.filename;

      const fileHandle = await root.getFileHandle(cleanFilename);
      const fileBlob = await fileHandle.getFile();
      const arrayBuffer = await fileBlob.arrayBuffer();

      // 3. Send the binary data back
      sqliteMessage.rows = arrayBuffer; // We re-use the 'rows' property to carry the buffer

    } catch (e) {
      sqliteMessage.error = e;
    } finally {
      // Transfer the arrayBuffer to avoid copying overhead
      if (sqliteMessage.rows) {
        // @ts-ignore
        self.postMessage(sqliteMessage); 
      } else {
        self.postMessage(sqliteMessage);
      }
    }
  }

};