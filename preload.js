const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  logout: (sessionId) => ipcRenderer.invoke('logout', sessionId),
  
  // User Management
  getUsers: () => ipcRenderer.invoke('get-users'),
  createUser: (userData) => ipcRenderer.invoke('create-user', userData),
  updateUserStatus: (data) => ipcRenderer.invoke('update-user-status', data),
  deleteUser: (userId) => ipcRenderer.invoke('delete-user', userId),
  
  // Doctors Management
  getDoctors: () => ipcRenderer.invoke('get-doctors'),
  addDoctor: (doctor) => ipcRenderer.invoke('add-doctor', doctor),
  updateDoctor: (doctor) => ipcRenderer.invoke('update-doctor', doctor),
  deleteDoctor: (doctorId) => ipcRenderer.invoke('delete-doctor', doctorId),
  
  // Patients Management
  getPatients: () => ipcRenderer.invoke('get-patients'),
  addPatient: (patient) => ipcRenderer.invoke('add-patient', patient),
  updatePatient: (patient) => ipcRenderer.invoke('update-patient', patient),
  
  // Medicines Management
  getMedicines: () => ipcRenderer.invoke('get-medicines'),
  addMedicine: (medicine) => ipcRenderer.invoke('add-medicine', medicine),
  updateMedicine: (medicine) => ipcRenderer.invoke('update-medicine', medicine),
  deleteMedicine: (medicineId) => ipcRenderer.invoke('delete-medicine', medicineId),
  
  // Transactions
  addTransaction: (transaction) => ipcRenderer.invoke('add-transaction', transaction),
  getTransactions: () => ipcRenderer.invoke('get-transactions'),
  
  // Lab Tests
  getLabTestsMaster: () => ipcRenderer.invoke('get-lab-tests-master'),
  addLabTestRecord: (labTest) => ipcRenderer.invoke('add-lab-test-record', labTest),
  getLabTestRecords: () => ipcRenderer.invoke('get-lab-test-records'),
  
  // Doctor Counts
  getDoctorCount: (data) => ipcRenderer.invoke('get-doctor-count', data),
  incrementDoctorCount: (data) => ipcRenderer.invoke('increment-doctor-count', data),
  
  // Departments
  getDepartments: () => ipcRenderer.invoke('get-departments'),
  addDepartment: (name) => ipcRenderer.invoke('add-department', name),
  deleteDepartment: (id) => ipcRenderer.invoke('delete-department', id)
});

console.log('Preload script loaded');