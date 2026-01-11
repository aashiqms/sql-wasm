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
  password?: string; // Added password
  error: any;
  sql: string;
  param: any;
  sqls: any;
  db: string;
  rows: any;
  rowsAffected: number;
}

// Store active database instances
const dbs: { [property: string]: Database } = {};
// Store crypto keys for each database
const dbKeys: { [property: string]: CryptoKey } = {};

const log = (...args) => console.log(...args);
const error = (...args) => console.error(...args);

// --- CRYPTO HELPERS START --- //

// Helper: Verify Password for specific actions
async function verifyPasswordAction(filename: string, password?: string): Promise<boolean> {
  const db = dbs[filename];
  if (!db) throw new Error('Database not initialized');

  // 1. Check if DB is protected
  const check = db.exec({
    sql: "SELECT salt, verifier FROM _security WHERE id = 1",
    returnValue: 'resultRows'
  });

  // If no security table, allow action (or deny based on your preference)
  if (check.length === 0) return true; 

  if (!password) {
    throw new Error("Password required for this action.");
  }

  // 2. Verify provided password
  const row = check[0];
  const saltHex = row[0] as string;
  const storedVerifier = row[1] as string;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  // Re-derive key from input password
  
  const actionKey = await deriveKey(password, salt as BufferSource);

  try {
    const dec = await decryptData(storedVerifier, actionKey);
    return dec === "VERIFIED";
  } catch (e) {
    throw new Error("Invalid Password.");
  }
}

/**
 * Derives an AES-GCM key from a user password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array | BufferSource): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      // FIX: Cast salt to BufferSource to satisfy TypeScript
      salt: salt as BufferSource, 
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a string -> returns Base64 string (IV + Ciphertext)
 */
async function encryptData(text: string, key: CryptoKey): Promise<string> {
  if (!text) return text;
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = enc.encode(text);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoded
  );

  // Combine IV and Ciphertext for storage
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Convert to Base64 for SQLite TEXT storage
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a Base64 string -> returns original string
 */
async function decryptData(base64: string, key: CryptoKey): Promise<string> {
  if (!base64) return base64;
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    throw new Error("Decryption failed. Wrong password or corrupted data.");
  }
}
// --- CRYPTO HELPERS END --- //

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

      const sqlite3 = await sqlite3InitModule({
        print: log,
        printErr: error,
      });

      try {
        const db = new sqlite3.oo1.OpfsDb(sqliteMessage.filename, sqliteMessage.flags);
        dbs[sqliteMessage.filename] = db;

        // --- PASSWORD PROTECTION LOGIC ---
        if (sqliteMessage.password) {
          
          // 1. Create/Check Security Table
          db.exec('CREATE TABLE IF NOT EXISTS _security (id INTEGER PRIMARY KEY, salt TEXT, verifier TEXT)');
          
          const existingSecurity = db.exec({
            sql: 'SELECT * FROM _security WHERE id = 1',
            returnValue: 'resultRows'
          });

          let key: CryptoKey;

          if (existingSecurity.length === 0) {
            // A. New Database (or newly protected): Setup Lock
            const salt = crypto.getRandomValues(new Uint8Array(16));
            // Convert salt to hex string for storage
            const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
            
            key = await deriveKey(sqliteMessage.password, salt);
            
            // Create a verification token
            const verifier = await encryptData("VERIFIED", key);
            
            db.exec({
              sql: 'INSERT INTO _security (id, salt, verifier) VALUES (1, ?, ?)',
              bind: [saltHex, verifier]
            });

          } else {
            // B. Existing Database: Verify Password
            const row = existingSecurity[0]; // [id, salt, verifier]
            const saltHex = row[1] as string;
            const storedVerifier = row[2] as string;

            // Convert hex salt back to Uint8Array
            const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            
            key = await deriveKey(sqliteMessage.password, salt);

            try {
              const check = await decryptData(storedVerifier, key);
              if (check !== "VERIFIED") throw new Error();
            } catch (e) {
              // DESTROY INSTANCE IF PASSWORD WRONG
              delete dbs[sqliteMessage.filename]; 
              throw new Error("Invalid Password: Access Denied");
            }
          }

          // Store key in memory for this session
          dbKeys[sqliteMessage.filename] = key;

          // 2. Register Custom SQL Functions
          // Usage: INSERT INTO users (name) VALUES (ENCRYPT(?));
          // Usage: SELECT DECRYPT(name) FROM users;
          db.createFunction({
            name: 'ENCRYPT',
            xFunc: (_ptr, arg) => {
              // Note: SQLite WASM UDFs are synchronous, but WebCrypto is async.
              // To solve this, we cannot use Async inside xFunc directly in standard builds easily.
              // We have to assume the user wants 'Gatekeeper' security mostly.
              // However, since we need to support 'Encrypt Data', we have a challenge.
              // WORKAROUND: For this specific WASM implementation, we handle encryption in JS
              // BEFORE passing to DB for Insert, and AFTER fetching for Select if possible.
              // BUT, to keep it clean, we will throw an error if they try to use SQL function
              // because standard SQLite WASM doesn't support Async UDFs yet.
              throw new Error("Please use application-level encryption helper or ensure `sqlite-wasm` supports async UDFs.");
            }
          });

        } else {
            // Check if DB requires password but none provided
             const check = db.exec({
                sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='_security'",
                returnValue: 'resultRows'
             });
             if (check.length > 0) {
                 delete dbs[sqliteMessage.filename];
                 throw new Error("This database is password protected. Please provide a password.");
             }
        }
        // --- END PASSWORD PROTECTION ---

      } catch (err) {
        sqliteMessage.error = err;
      } finally {
        self.postMessage(sqliteMessage);
      }
    } catch (err) {
      sqliteMessage.error = err;
      self.postMessage(sqliteMessage);
    }
  }

  // Helper to check access
  const checkAccess = (filename: string) => {
      if (!dbs[filename]) {
        throw new Error('Database not initialized or Access Denied');
      }
  };

  // Helper for Encryption/Decryption in Batch/Execute
  // We scan params for a specific object signature to auto-encrypt? 
  // Or we just rely on the Gatekeeper for now. 
  // Let's rely on Gatekeeper + Manual Crypto methods if you want.

  /********************* EXECUTE_SQL  *********************/
  if (sqliteMessage.type === 'executeSql') {
    try {
      checkAccess(sqliteMessage.filename);
      
      // ... existing execution logic ...
      const values: any = [];
      if (!sqliteMessage.param) sqliteMessage.param = [];
      stringifyParamObjects(sqliteMessage.param);

      // --- OPTIONAL: AUTO ENCRYPT params marked with prefix? ---
      // For now, standard execution
      
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
      checkAccess(sqliteMessage.filename); // GATEKEEPER CHECK

      dbs[sqliteMessage.filename].exec('BEGIN TRANSACTION');
      let changes = 0;
      
      // If we have a password, we could potentially decrypt/encrypt here
      // But for bulk operations, we assume data is already prepared.
      
      sqliteMessage.sqls.forEach(([sql, param]) => {
        if (!param) param = [];
        stringifyParamObjects(param);
        dbs[sqliteMessage.filename].exec({ sql: sql, bind: param });
        changes += dbs[sqliteMessage.filename].changes();
      });
      dbs[sqliteMessage.filename].exec('COMMIT');
      sqliteMessage.rowsAffected = changes;
    } catch (e) {
      dbs[sqliteMessage.filename].exec('ROLLBACK');
      sqliteMessage.error = e;
    } finally {
      self.postMessage(sqliteMessage);
    }
  }
  
  // ... Keep batchReturnSql and Export logic same, just add checkAccess() ..

  /****************** BATCH_RETURN ******************/
  if (sqliteMessage.type === 'batchReturnSql') {
    try {
      checkAccess(sqliteMessage.filename);
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
    // checkAccess(sqliteMessage.filename); // Prevents downloading if password wasn't provided!
    await verifyPasswordAction(sqliteMessage.filename, sqliteMessage.password);
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