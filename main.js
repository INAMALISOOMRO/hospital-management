const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const mysql = require('mysql2/promise');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
require('dotenv').config();

let mainWindow;
let dbPool;
let dbConnected = false;
let syncInterval;
let reconnectInterval;
let connectionCheckInterval;
let pollingInterval; // NEW: For real-time polling

// ============================================
// Enhanced MySQL Configuration
// ============================================
const dbConfig = {
  host: process.env.DB_HOST || '192.168.1.12',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'hospital_user',
  password: process.env.DB_PASSWORD || '@Inamalisoomro90mysql',
  database: process.env.DB_NAME || 'hospital_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  acquireTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

// ============================================
// NEW: Track Last Sync Timestamps
// ============================================
let lastSyncTimestamps = {
  users: null,
  patients: null,
  medicines: null,
  labTests: null,
  transactions: null
};

// ============================================
// Enhanced Database Connection
// ============================================
async function initDatabase() {
  try {
    console.log('\n========================================');
    console.log('🔄 Attempting MySQL Connection...');
    console.log('========================================');
    console.log('📍 Host:', dbConfig.host);
    console.log('📍 Port:', dbConfig.port);
    console.log('📍 Database:', dbConfig.database);
    console.log('📍 User:', dbConfig.user);
    console.log('========================================\n');
    
    if (dbPool) {
      try {
        await dbPool.end();
        console.log('🔌 Closed old connection pool');
      } catch (err) {
        console.log('⚠️ Error closing old pool:', err.message);
      }
    }
    
    // Test basic network connectivity
    const net = require('net');
    const canConnect = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      
      socket.on('connect', () => {
        console.log('✅ Network connection to MySQL server successful');
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        console.log('❌ Connection timeout - server not reachable');
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', (err) => {
        console.log('❌ Network error:', err.code);
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(dbConfig.port, dbConfig.host);
    });
    
    if (!canConnect) {
      throw new Error('Cannot reach MySQL server');
    }
    
    console.log('🏗️ Creating MySQL connection pool...');
    dbPool = mysql.createPool(dbConfig);
    
    console.log('🧪 Testing MySQL authentication...');
    const connection = await dbPool.getConnection();
    console.log('✅ MySQL authentication successful!');
    
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log('✅ Database access confirmed -', rows[0].count, 'users found');
    
    connection.release();
    
    dbConnected = true;
    console.log('\n🎉 DATABASE CONNECTED SUCCESSFULLY!\n');
    
    notifyConnectionStatus(true);
    
    // NEW: Start real-time polling
    startRealTimePolling();
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ MySQL Connection FAILED');
    console.error('❌ ========================================');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('========================================\n');
    
    dbConnected = false;
    notifyConnectionStatus(false);
    
    if (!reconnectInterval) {
      console.log('⏰ Setting up auto-reconnect (every 30 seconds)...');
      reconnectInterval = setInterval(() => {
        console.log('🔄 Attempting to reconnect...');
        initDatabase();
      }, 30000);
    }
    
    return false;
  }
}

// ============================================
// NEW: Real-Time Polling System
// ============================================
function startRealTimePolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  console.log('🚀 Starting real-time polling (every 3 seconds)...');
  
  // Poll every 3 seconds for real-time updates
  pollingInterval = setInterval(async () => {
    if (!dbConnected) return;
    
    try {
      // Check for new/updated data
      await checkForUpdates();
    } catch (error) {
      console.error('Polling error:', error.message);
    }
  }, 3000); // 3 seconds for near real-time
}

// ============================================
// NEW: Check for Updates
// ============================================
async function checkForUpdates() {
  try {
    const BrowserWindow = require('electron').BrowserWindow;
    const allWindows = BrowserWindow.getAllWindows();
    
    if (allWindows.length === 0) return;
    
    // Check each table for new records
    const updates = {
      users: await checkTableUpdates('users', 'created_at'),
      patients: await checkTableUpdates('patients', 'created_at'),  // ✅ ADDED
      medicines: await checkTableUpdates('medicines', 'updated_at'),
      labTests: await checkTableUpdates('lab_test_records', 'created_at'),
      transactions: await checkTableUpdates('transactions', 'created_at')
    };
    
    // Broadcast updates to all windows
    let hasUpdates = false;
    Object.keys(updates).forEach(table => {
      if (updates[table].hasNew) {
        hasUpdates = true;
        
        console.log(`📢 Broadcasting ${table} update to ${allWindows.length} window(s)`);
        
        allWindows.forEach(window => {
          if (window && window.webContents) {
            window.webContents.send('data-updated', {
              table: table,
              data: updates[table].newData,
              timestamp: new Date().toISOString()
            });
          }
        });
      }
    });
    
    if (hasUpdates) {
      console.log('📥 New data detected and broadcasted to all clients');
    }
    
  } catch (error) {
    console.error('Error checking for updates:', error.message);
  }
}


// ============================================
// NEW: Check Specific Table for Updates
// ============================================
async function checkTableUpdates(tableName, timestampColumn) {
  try {
    if (!lastSyncTimestamps[tableName]) {
      // First time - get latest timestamp only
      const [rows] = await dbPool.query(
        `SELECT MAX(${timestampColumn}) as latest FROM ${tableName}`
      );
      lastSyncTimestamps[tableName] = rows[0].latest || new Date().toISOString();
      return { hasNew: false, newData: [] };
    }
    
    // Check for records newer than last sync
    const [rows] = await dbPool.query(
      `SELECT * FROM ${tableName} WHERE ${timestampColumn} > ? ORDER BY ${timestampColumn} DESC LIMIT 100`,
      [lastSyncTimestamps[tableName]]
    );
    
    if (rows.length > 0) {
      // Update last sync timestamp
      lastSyncTimestamps[tableName] = rows[0][timestampColumn];
      return { hasNew: true, newData: rows };
    }
    
    return { hasNew: false, newData: [] };
  } catch (error) {
    console.error(`Error checking ${tableName}:`, error.message);
    return { hasNew: false, newData: [] };
  }
}


// ============================================
// Connection Status Notification
// ============================================
function notifyConnectionStatus(connected) {
  const BrowserWindow = require('electron').BrowserWindow;
  const allWindows = BrowserWindow.getAllWindows();
  
  console.log(`📡 Broadcasting connection status: ${connected ? 'ONLINE ✅' : 'OFFLINE ⚠️'}`);
  
  const statusData = {
    connected: connected,
    timestamp: new Date().toISOString(),
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database
  };
  
  allWindows.forEach(window => {
    if (window && window.webContents) {
      window.webContents.send('db-connection-status', statusData);
    }
  });
}

// ============================================
// IPC Handler - Get Connection Status
// ============================================
ipcMain.handle('get-db-status', async () => {
  return {
    connected: dbConnected,
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    timestamp: new Date().toISOString()
  };
});

// ============================================
// NEW: IPC Handler - Immediate Sync After Save
// ============================================
ipcMain.handle('trigger-immediate-sync', async (event, { table, action }) => {
  console.log(`🚀 Immediate sync triggered: ${table} - ${action}`);
  
  // Force immediate check for updates
  await checkForUpdates();
  
  return { success: true };
});

// ============================================
// IPC Handler - Sync Patients (ENHANCED)
// ============================================
ipcMain.handle('sync-patients', async (event, patients) => {
  console.log('\n========================================');
  console.log('🔄 PATIENT SYNC REQUEST');
  console.log('========================================');
  console.log('Patients to sync:', patients.length);
  console.log('========================================\n');
  
  if (!dbConnected) {
    return { 
      success: false, 
      message: 'Server not available',
      synced: 0,
      total: patients.length 
    };
  }
  
  let syncedCount = 0;
  let failedCount = 0;
  const errors = [];
  
  try {
    for (const patient of patients) {
      try {
        await dbPool.query(
          `INSERT INTO patients (id, name, contact, gender, age, doctor_id, notes, bp, weight, amount, 
           temperature, date_added, rx, visit_data, is_free) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
           name = VALUES(name), 
           contact = VALUES(contact), 
           notes = VALUES(notes), 
           rx = VALUES(rx), 
           visit_data = VALUES(visit_data)`,
          [
            patient.id,
            patient.name,
            patient.contact || null,
            patient.gender || null,
            patient.age || null,
            patient.doctorId || null,
            patient.notes || null,
            patient.bp || null,
            patient.weight || null,
            patient.amount || null,
            patient.temperature || null,
            patient.dateAdded || new Date().toISOString().split('T')[0],
            patient.rx || null,
            patient.visitData ? JSON.stringify(patient.visitData) : null,
            patient.isFree || false
          ]
        );
        
        syncedCount++;
      } catch (err) {
        failedCount++;
        errors.push(`${patient.id}: ${err.message}`);
      }
    }
    
    console.log(`✅ Synced: ${syncedCount}, ❌ Failed: ${failedCount}\n`);
    
    // Trigger immediate update check
    setTimeout(() => checkForUpdates(), 500);
    
    return { 
      success: true, 
      synced: syncedCount, 
      failed: failedCount,
      total: patients.length
    };
    
  } catch (error) {
    console.error('❌ Batch sync error:', error);
    return { 
      success: false, 
      message: error.message, 
      synced: syncedCount,
      total: patients.length
    };
  }
});


// ============================================
// IPC Handler - Get Users (ENHANCED)
// ============================================
ipcMain.handle('get-users', async () => {
  try {
    if (!dbConnected || !dbPool) {
      return { success: false, message: 'Database not connected' };
    }
    
    const [rows] = await dbPool.query(
      'SELECT id, username, password, full_name, role, status, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    
    console.log(`📤 Sending ${rows.length} users to client`);
    return { success: true, users: rows };
  } catch (error) {
    console.error('Get users error:', error);
    return { success: false, message: error.message };
  }
});

// ============================================
// IPC Handler - Create User (ENHANCED)
// ============================================
ipcMain.handle('create-user', async (event, userData) => {
  try {
    if (!dbConnected || !dbPool) {
      return { success: false, message: 'Database not connected' };
    }
    
    const [result] = await dbPool.query(
      'INSERT INTO users (username, password, full_name, role, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [userData.username, userData.password, userData.fullName, userData.role, 'active', userData.createdBy]
    );
    
    console.log(`✅ Created user: ${userData.username}`);
    
    // Trigger immediate update
    setTimeout(() => checkForUpdates(), 500);
    
    return { success: true, userId: result.insertId };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { success: false, message: 'Username already exists' };
    }
    return { success: false, message: error.message };
  }
});



ipcMain.handle('get-all-patients', async () => {
  try {
    if (!dbConnected || !dbPool) {
      return { success: false, message: 'Database not connected', patients: [] };
    }
    
    console.log('📤 Fetching all patients from server...');
    
    const [rows] = await dbPool.query(`
      SELECT 
        p.*,
        d.name as doctor_name
      FROM patients p
      LEFT JOIN doctors d ON p.doctor_id = d.id
      ORDER BY p.created_at DESC
      LIMIT 1000
    `);
    
    console.log(`✅ Found ${rows.length} patients on server`);
    
    return { 
      success: true, 
      patients: rows,
      count: rows.length
    };
    
  } catch (error) {
    console.error('❌ Error fetching patients:', error);
    return { 
      success: false, 
      message: error.message,
      patients: []
    };
  }
});
// ============================================
// IPC Handler - Add Single Patient to Server
// ============================================
// ============================================
// IPC Handler - Add Single Patient to Server (FIXED)
// Replace your existing handler with this version
// ============================================
ipcMain.handle('add-patient-to-server', async (event, patientData) => {
  try {
    if (!dbConnected || !dbPool) {
      return { success: false, message: 'Database not connected' };
    }
    
    console.log('📥 Adding patient to server:', patientData.id);
    
    // Find doctor ID by name
    let doctorId = null;
    if (patientData.doctor) {
      const [doctorRows] = await dbPool.query(
        'SELECT id FROM doctors WHERE name = ? LIMIT 1',
        [patientData.doctor]
      );
      
      if (doctorRows.length > 0) {
        doctorId = doctorRows[0].id;
      }
    }
    
    // ✅ FIXED: Handle empty strings and convert to proper types
    const processValue = (value, type = 'string') => {
      if (value === '' || value === undefined) return null;
      if (type === 'number') {
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
      }
      return value;
    };
    
    // Insert or update patient with proper null handling
    await dbPool.query(
      `INSERT INTO patients 
        (id, name, contact, gender, age, doctor_id, notes, bp, weight, amount, 
         temperature, date_added, rx, visit_data, is_free) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         name = VALUES(name),
         contact = VALUES(contact),
         gender = VALUES(gender),
         age = VALUES(age),
         doctor_id = VALUES(doctor_id),
         notes = VALUES(notes),
         bp = VALUES(bp),
         weight = VALUES(weight),
         amount = VALUES(amount),
         temperature = VALUES(temperature),
         rx = VALUES(rx),
         visit_data = VALUES(visit_data),
         is_free = VALUES(is_free)`,
      [
        patientData.id,
        patientData.name,
        processValue(patientData.contact),
        processValue(patientData.gender),
        processValue(patientData.age),
        doctorId,
        processValue(patientData.notes),
        processValue(patientData.bp),
        processValue(patientData.weight, 'number'),
        processValue(patientData.amount),
        processValue(patientData.temperature),
        patientData.dateAdded || new Date().toISOString().split('T')[0],
        processValue(patientData.rx),
        patientData.visitData ? JSON.stringify(patientData.visitData) : null,
        patientData.isFree ? 1 : 0
      ]
    );
    
    console.log('✅ Patient added to server successfully:', patientData.id);
    
    // Trigger immediate update check
    setTimeout(() => checkForUpdates(), 500);
    
    return { 
      success: true, 
      patientId: patientData.id,
      message: 'Patient saved to server'
    };
    
  } catch (error) {
    console.error('❌ Error adding patient to server:', error);
    
    // Check if it's a duplicate key error (patient already exists)
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('ℹ️ Patient already exists on server');
      return { 
        success: true, 
        message: 'Patient already exists',
        patientId: patientData.id
      };
    }
    
    return { 
      success: false, 
      message: error.message 
    };
  }
});
// ============================================
// IPC Handler - Get Patients Count
// ============================================
ipcMain.handle('get-patients-count', async () => {
  try {
    if (!dbConnected || !dbPool) {
      return { success: false, count: 0 };
    }
    
    const [rows] = await dbPool.query('SELECT COUNT(*) as count FROM patients');
    
    return { 
      success: true, 
      count: rows[0].count 
    };
    
  } catch (error) {
    console.error('Error getting patient count:', error);
    return { 
      success: false, 
      count: 0 
    };
  }
});
// ============================================
// Create Main Window
// ============================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'logo.png'),
    show: false,
    backgroundColor: '#ffffff'
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Send initial connection status
    setTimeout(() => {
      notifyConnectionStatus(dbConnected);
    }, 500);
  });
  
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(async () => {
  console.log('\n🚀 Application Starting...\n');
  
  await initDatabase();
  createWindow();
  
  // Auto-updater
  setTimeout(() => {
    log.info('🔄 Checking for updates...');
    autoUpdater.checkForUpdates().catch(err => {
      log.error('Update check failed:', err);
    });
  }, 3000);
});

app.on('before-quit', async () => {
  console.log('🛑 Application shutting down...');
  
  if (syncInterval) clearInterval(syncInterval);
  if (reconnectInterval) clearInterval(reconnectInterval);
  if (connectionCheckInterval) clearInterval(connectionCheckInterval);
  if (pollingInterval) clearInterval(pollingInterval); // NEW
  
  if (dbPool) {
    await dbPool.end();
    console.log('🔌 Database connection closed');
  }
});

console.log('✅ Real-time sync system initialized');