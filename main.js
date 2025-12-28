const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
require('dotenv').config();

let mainWindow;
let dbPool;

// ============================================
// Auto-Update Configuration
// ============================================

// Configure logging for updates
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// Auto-updater settings
autoUpdater.autoDownload = true; // Auto-download updates
autoUpdater.autoInstallOnAppQuit = true; // Install on quit

// ============================================
// MySQL Configuration
// ============================================
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || `@Inamalisoomro90mysql`,
  database: process.env.DB_NAME || 'hospital_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// ============================================
// Database Connection
// ============================================
async function initDatabase() {
  try {
    console.log('Connecting to MySQL Server...');
    console.log('Host:', dbConfig.host);
    console.log('Database:', dbConfig.database);
    
    dbPool = await mysql.createPool(dbConfig);
    
    // Test connection
    const connection = await dbPool.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
    
    return true;
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    
    dialog.showErrorBox(
      'Database Connection Error',
      `Failed to connect to MySQL Server.\n\n` +
      `Host: ${dbConfig.host}\n` +
      `Database: ${dbConfig.database}\n\n` +
      `Error: ${error.message}\n\n` +
      `Please check:\n` +
      `1. MySQL Server is running\n` +
      `2. Database exists\n` +
      `3. Credentials in .env file are correct`
    );
    
    return false;
  }
}

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
    
    // Show update notification in window
    mainWindow.webContents.executeJavaScript(`
      const updateBanner = document.createElement('div');
      updateBanner.id = 'update-banner';
      updateBanner.style.cssText = 'display: none; position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px; text-align: center; z-index: 9999; font-weight: 600; box-shadow: 0 2px 10px rgba(0,0,0,0.3);';
      document.body.appendChild(updateBanner);
    `);
  });
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================
// Auto-Update Event Handlers
// ============================================

// Add these to your main.js auto-update section
// Replace the existing autoUpdater event handlers with these enhanced versions

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for updates...');
  sendStatusToWindow('Checking for updates...');
  
  // Send to renderer process for UI update
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-checking');
  }
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info.version);
  sendStatusToWindow(`🎉 New version ${info.version} is available! Downloading...`);
  
  // Send to renderer process
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-available', info);
  }
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `A new version ${info.version} is available!`,
    detail: 'The update is being downloaded in the background. You will be notified when it\'s ready to install.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available. Current version:', info.version);
  sendStatusToWindow('You are running the latest version! ✅');
  
  // Send to renderer process
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-not-available', info);
  }
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater:', err);
  sendStatusToWindow('❌ Error checking for updates: ' + err.message);
  
  // Send to renderer process
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-error', err.message);
  }
  
  // Don't block the app if update check fails
  setTimeout(() => {
    sendStatusToWindow('');
  }, 5000);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = `Download speed: ${Math.round(progressObj.bytesPerSecond / 1024)} KB/s`;
  log_message += ` - Downloaded ${Math.round(progressObj.percent)}%`;
  log_message += ` (${Math.round(progressObj.transferred / 1024 / 1024)}MB / ${Math.round(progressObj.total / 1024 / 1024)}MB)`;
  
  log.info(log_message);
  sendStatusToWindow(`📥 Downloading update: ${Math.round(progressObj.percent)}%`);
  
  // Send detailed progress to renderer
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded. Version:', info.version);
  sendStatusToWindow('✅ Update downloaded successfully!');
  
  // Send to renderer process
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-downloaded', info);
  }
  
  // Show dialog with restart option
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update Downloaded Successfully!',
    detail: `Version ${info.version} has been downloaded and is ready to install.\n\nThe application will restart to apply the update.`,
    buttons: ['Restart Now', 'Restart Later']
  }).then((result) => {
    if (result.response === 0) { // Restart Now clicked
      log.info('User chose to restart now');
      setImmediate(() => autoUpdater.quitAndInstall());
    } else {
      log.info('User chose to restart later');
      sendStatusToWindow('Update will be installed on next restart');
      
      // Auto-install on next app quit
      autoUpdater.autoInstallOnAppQuit = true;
    }
  });
});

// ============================================
// Send Update Status to Window
// ============================================
function sendStatusToWindow(text) {
  if (mainWindow && mainWindow.webContents) {
    log.info('Status:', text);
    mainWindow.webContents.executeJavaScript(`
      const banner = document.getElementById('update-banner');
      if (banner) {
        if ('${text}') {
          banner.textContent = '${text.replace(/'/g, "\\'")}';
          banner.style.display = 'block';
          
          // Auto-hide success messages after 5 seconds
          if ('${text}'.includes('✅') || '${text}'.includes('latest version')) {
            setTimeout(() => {
              banner.style.display = 'none';
            }, 5000);
          }
        } else {
          banner.style.display = 'none';
        }
      }
    `);
  }
}

// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(async () => {
  const connected = await initDatabase();
  
  if (!connected) {
    app.quit();
    return;
  }
  
  createWindow();

  // Check for updates after window is created (5 seconds delay)
  setTimeout(() => {
    log.info('Starting update check...');
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (dbPool) {
    await dbPool.end();
    console.log('Database connection closed');
  }
});

// ============================================
// IPC Handler - Manual Update Check
// ============================================
ipcMain.handle('check-for-updates', async () => {
  log.info('Manual update check requested');
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    log.error('Manual update check failed:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Authentication
// ============================================

ipcMain.handle('login', async (event, { username, password, role }) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT id, username, password, full_name, role, status FROM users WHERE username = ? AND role = ?',
      [username, role]
    );

    if (rows.length === 0) {
      return { success: false, message: 'Invalid username or role' };
    }

    const user = rows[0];
    
    if (user.status !== 'active') {
      return { success: false, message: 'Account is inactive. Contact administrator.' };
    }

    // Simple password check (in production, use bcrypt.compare)
    if (user.password !== password) {
      return { success: false, message: 'Invalid password' };
    }

    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    await dbPool.query(
      'INSERT INTO sessions (session_id, user_id) VALUES (?, ?)',
      [sessionId, user.id]
    );

    // Update last login
    await dbPool.query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    return {
      success: true,
      user: {
        userId: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        sessionId
      }
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'Database error: ' + error.message };
  }
});

ipcMain.handle('logout', async (event, sessionId) => {
  try {
    await dbPool.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false };
  }
});

// ============================================
// IPC Handlers - User Management
// ============================================

ipcMain.handle('get-users', async () => {
  try {
    const [rows] = await dbPool.query(
      'SELECT id, username, full_name, role, status, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    return { success: true, users: rows };
  } catch (error) {
    console.error('Get users error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('create-user', async (event, userData) => {
  try {
    const [result] = await dbPool.query(
      'INSERT INTO users (username, password, full_name, role, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [userData.username, userData.password, userData.fullName, userData.role, 'active', userData.createdBy]
    );
    
    return { success: true, userId: result.insertId };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { success: false, message: 'Username already exists' };
    }
    return { success: false, message: error.message };
  }
});

ipcMain.handle('update-user-status', async (event, { userId, status }) => {
  try {
    await dbPool.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('delete-user', async (event, userId) => {
  try {
    await dbPool.query('DELETE FROM users WHERE id = ?', [userId]);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============================================
// IPC Handlers - Doctors
// ============================================

ipcMain.handle('get-doctors', async () => {
  try {
    const [rows] = await dbPool.query(
      'SELECT id, name, department, visit_section FROM doctors ORDER BY name'
    );
    return { success: true, doctors: rows };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('add-doctor', async (event, doctor) => {
  try {
    const [result] = await dbPool.query(
      'INSERT INTO doctors (name, department, visit_section) VALUES (?, ?, ?)',
      [doctor.name, doctor.department, doctor.visitSection || false]
    );
    return { success: true, doctorId: result.insertId };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('update-doctor', async (event, doctor) => {
  try {
    await dbPool.query(
      'UPDATE doctors SET name = ?, department = ?, visit_section = ? WHERE id = ?',
      [doctor.name, doctor.department, doctor.visitSection, doctor.id]
    );
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('delete-doctor', async (event, doctorId) => {
  try {
    await dbPool.query('DELETE FROM doctors WHERE id = ?', [doctorId]);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============================================
// IPC Handlers - Patients
// ============================================

ipcMain.handle('get-patients', async () => {
  try {
    const [rows] = await dbPool.query(`
      SELECT p.*, d.name as doctor_name, d.department
      FROM patients p
      LEFT JOIN doctors d ON p.doctor_id = d.id
      ORDER BY p.created_at DESC
    `);
    return { success: true, patients: rows };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('add-patient', async (event, patient) => {
  try {
    await dbPool.query(
      `INSERT INTO patients (id, name, contact, gender, age, doctor_id, notes, bp, weight, amount, 
       temperature, date_added, rx, visit_data, is_free) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient.id, patient.name, patient.contact, patient.gender, patient.age,
        patient.doctorId, patient.notes, patient.bp, patient.weight, patient.amount,
        patient.temperature, patient.dateAdded, patient.rx,
        JSON.stringify(patient.visitData), patient.isFree || false
      ]
    );
    
    // Increment doctor count
    if (patient.doctorId) {
      await dbPool.query(
        `INSERT INTO doctor_counts (doctor_id, count_date, patient_count) 
         VALUES (?, ?, 1) 
         ON DUPLICATE KEY UPDATE patient_count = patient_count + 1`,
        [patient.doctorId, patient.dateAdded]
      );
    }
    
    return { success: true };
  } catch (error) {
    console.error('Add patient error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('update-patient', async (event, patient) => {
  try {
    await dbPool.query(
      `UPDATE patients SET name = ?, contact = ?, notes = ?, rx = ?, visit_data = ? WHERE id = ?`,
      [patient.name, patient.contact, patient.notes, patient.rx, JSON.stringify(patient.visitData), patient.id]
    );
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============================================
// IPC Handlers - Medicines
// ============================================

ipcMain.handle('get-medicines', async () => {
  try {
    const [rows] = await dbPool.query('SELECT * FROM medicines ORDER BY name');
    return { success: true, medicines: rows };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('add-medicine', async (event, medicine) => {
  try {
    const [result] = await dbPool.query(
      `INSERT INTO medicines (name, barcode, boxes, tablets_per_box, total_tablets, 
       price_per_tablet, price_per_box, expiry) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        medicine.name, medicine.barcode, medicine.boxes, medicine.tablets_per_box,
        medicine.totalTablets, medicine.price_per_tablet, medicine.price_per_box, medicine.expiry
      ]
    );
    return { success: true, medicineId: result.insertId };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('update-medicine', async (event, medicine) => {
  try {
    await dbPool.query(
      `UPDATE medicines SET name = ?, barcode = ?, boxes = ?, tablets_per_box = ?, 
       total_tablets = ?, price_per_tablet = ?, price_per_box = ?, expiry = ? 
       WHERE id = ?`,
      [
        medicine.name, medicine.barcode, medicine.boxes, medicine.tablets_per_box,
        medicine.totalTablets, medicine.price_per_tablet, medicine.price_per_box,
        medicine.expiry, medicine.id
      ]
    );
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('delete-medicine', async (event, medicineId) => {
  try {
    await dbPool.query('DELETE FROM medicines WHERE id = ?', [medicineId]);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============================================
// IPC Handlers - Transactions
// ============================================

ipcMain.handle('add-transaction', async (event, transaction) => {
  try {
    const [result] = await dbPool.query(
      'INSERT INTO transactions (items, total) VALUES (?, ?)',
      [JSON.stringify(transaction.items), transaction.total]
    );
    return { success: true, transactionId: result.insertId };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-transactions', async () => {
  try {
    const [rows] = await dbPool.query(
      'SELECT * FROM transactions ORDER BY transaction_date DESC'
    );
    
    // Parse JSON items
    const transactions = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items)
    }));
    
    return { success: true, transactions };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============================================
// IPC Handlers - Lab Tests
// ============================================

ipcMain.handle('get-lab-tests-master', async () => {
  try {
    const [rows] = await dbPool.query('SELECT * FROM lab_tests_master ORDER BY name');
    return { success: true, tests: rows };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('add-lab-test-record', async (event, labTest) => {
  try {
    await dbPool.query(
      `INSERT INTO lab_test_records (id, patient_name, age, gender, clinic, phone, 
       contact, prize, referred_by, doctor_name, test_name, date_added) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        labTest.id, labTest.name, labTest.age, labTest.gender, labTest.clinic,
        labTest.phone, labTest.contact, labTest.prize, labTest.referredBy,
        labTest.drName, labTest.testName, labTest.dateAdded
      ]
    );
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-lab-test-records', async () => {
  try {
    const [rows] = await dbPool.query(
      'SELECT * FROM lab_test_records ORDER BY created_at DESC'
    );
    return { success: true, labTests: rows };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============================================
// IPC Handlers - Doctor Counts
// ============================================

ipcMain.handle('get-doctor-count', async (event, { doctorId, date }) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT patient_count FROM doctor_counts WHERE doctor_id = ? AND count_date = ?',
      [doctorId, date]
    );
    
    const count = rows.length > 0 ? rows[0].patient_count : 0;
    return { success: true, count };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

console.log('✅ Main process initialized with MySQL and Auto-Update');