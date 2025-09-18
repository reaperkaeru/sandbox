const SHEET_NAMES = {
  users: 'Users',
  projects: 'Projects',
  tasks: 'Tasks',
  logs: 'Time Logs'
};

const USERS_HEADERS = [
  'UserID / IDUsuario',
  'Name / Nombre',
  'Email / Correo',
  'Role / Rol',
  'PasswordHash / HashContraseña',
  'Language / Idioma',
  'Notifications / Notificaciones',
  'Mode / Modo',
  'CreatedAt / Creado',
  'UpdatedAt / Actualizado',
  'IsTemporary / EsTemporal'
];

const PROJECT_HEADERS = [
  'ProjectID / IDProyecto',
  'ProjectName / NombreProyecto',
  'Description / Descripción',
  'Status / Estado',
  'CreatedAt / Creado',
  'UpdatedAt / Actualizado'
];

const TASK_HEADERS = [
  'TaskID / IDTarea',
  'ProjectID / IDProyecto',
  'TaskName / NombreTarea',
  'Description / Descripción',
  'AssignedTo / AsignadoA',
  'Status / Estado',
  'Priority / Prioridad',
  'DueDate / FechaEntrega',
  'IsCommunal / EsComunal',
  'CreatedAt / Creado',
  'UpdatedAt / Actualizado'
];

const TIME_LOG_HEADERS = [
  'LogID / IDRegistro',
  'UserID / IDUsuario',
  'Date / Fecha',
  'StartTime / Inicio',
  'EndTime / Fin',
  'Duration / Duración'
];

const ROLE_PRIORITY = {
  Admin: 3,
  Manager: 2,
  Staff: 1
};

const SESSION_CACHE_SECONDS = 6 * 60 * 60;
const PASSWORD_SALT = 'SpiralDG::v1';
// End constants section / Fin de la sección de constantes

function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet(ss, SHEET_NAMES.users, USERS_HEADERS);
  ensureSheet(ss, SHEET_NAMES.projects, PROJECT_HEADERS);
  ensureSheet(ss, SHEET_NAMES.tasks, TASK_HEADERS);
  ensureSheet(ss, SHEET_NAMES.logs, TIME_LOG_HEADERS);
}
// End sheet setup section / Fin de la sección de configuración de hojas

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = headers.some(function (header, index) {
    return currentHeaders[index] !== header;
  });
  if (needsHeaders) {
    headerRange.setValues([headers]);
  }
  sheet.setFrozenRows(1);
  const lastColumn = sheet.getLastColumn();
  const missingColumns = headers.length - lastColumn;
  if (missingColumns > 0) {
    sheet.insertColumnsAfter(lastColumn || 1, missingColumns);
  }
}
// End ensure sheet helper section / Fin de la sección del ayudante ensureSheet

function createDefaultAdmin() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.users);
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) {
    return;
  }
  const now = new Date();
  const adminId = Utilities.getUuid();
  const passwordHash = hashPassword('!@Mado1120');
  sheet.appendRow([
    adminId,
    'Spiral Admin',
    'spiraldg1@gmail.com',
    'Admin',
    passwordHash,
    'en',
    'Enabled',
    'Light',
    now,
    now,
    true
  ]);
}
// End admin seeding section / Fin de la sección de creación del administrador

function initializeEnvironment() {
  setupSheets();
  createDefaultAdmin();
}
// End environment initialization section / Fin de la sección de inicialización del entorno

function login(email, password) {
  initializeEnvironment();
  if (!email || !password) {
    throw new Error('Missing credentials / Faltan credenciales');
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.users);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[2]).toLowerCase() === String(email).toLowerCase()) {
      const storedHash = row[4] || '';
      const providedHash = hashPassword(password);
      if (storedHash && storedHash === providedHash) {
        const user = buildUserFromRow(row);
        const token = createSession(user);
        updateUserTimestamp(sheet, i + 1);
        return { success: true, token: token, user: user };
      }
      if (!storedHash && password === '!@Mado1120') {
        const user = buildUserFromRow(row);
        const token = createSession(user);
        updateUserPassword(sheet, i + 1, providedHash, true);
        return { success: true, token: token, user: user };
      }
      break;
    }
  }
  throw new Error('Invalid credentials / Credenciales inválidas');
}
// End login section / Fin de la sección de inicio de sesión

function logout(token) {
  if (!token) {
    return { success: true };
  }
  const cache = CacheService.getScriptCache();
  cache.remove(buildSessionKey(token));
  return { success: true };
}
// End logout section / Fin de la sección de cierre de sesión

function getCurrentUser(token) {
  const session = requireSession(token);
  return { success: true, user: session };
}
// End current user section / Fin de la sección de usuario actual

function createProject(project, token) {
  const session = requireSession(token);
  requireRole(session, ['Admin', 'Manager']);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.projects);
  const now = new Date();
  const projectId = project.id || Utilities.getUuid();
  sheet.appendRow([
    projectId,
    project.name || 'Untitled',
    project.description || '',
    project.status || 'Active',
    now,
    now
  ]);
  return { success: true, project: getProjectById(projectId) };
}
// End project creation section / Fin de la sección de creación de proyectos

function getProjects(token) {
  const session = requireSession(token);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.projects);
  const rows = sheet.getDataRange().getValues();
  const projects = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    projects.push({
      id: row[0],
      name: row[1],
      description: row[2],
      status: row[3],
      createdAt: row[4] instanceof Date ? row[4].toISOString() : row[4],
      updatedAt: row[5] instanceof Date ? row[5].toISOString() : row[5]
    });
  }
  projects.sort(function (a, b) {
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  return { success: true, projects: projects, recentProjects: projects.slice(0, 5) };
}
// End project retrieval section / Fin de la sección de obtención de proyectos

function updateProject(project, token) {
  const session = requireSession(token);
  requireRole(session, ['Admin', 'Manager']);
  if (!project || !project.id) {
    throw new Error('Project ID required / Se requiere ID de proyecto');
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.projects);
  const rowIndex = findRowIndexById(sheet, project.id);
  if (rowIndex === -1) {
    throw new Error('Project not found / Proyecto no encontrado');
  }
  const now = new Date();
  sheet.getRange(rowIndex, 1, 1, PROJECT_HEADERS.length).setValues([
    [
      project.id,
      project.name || '',
      project.description || '',
      project.status || 'Active',
      sheet.getRange(rowIndex, 5).getValue(),
      now
    ]
  ]);
  return { success: true, project: getProjectById(project.id) };
}
// End project update section / Fin de la sección de actualización de proyectos

function deleteProject(projectId, token) {
  const session = requireSession(token);
  requireRole(session, ['Admin']);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.projects);
  const rowIndex = findRowIndexById(sheet, projectId);
  if (rowIndex === -1) {
    throw new Error('Project not found / Proyecto no encontrado');
  }
  sheet.deleteRow(rowIndex);
  deleteTasksByProject(projectId);
  return { success: true };
}
// End project deletion section / Fin de la sección de eliminación de proyectos

function createTask(task, token) {
  const session = requireSession(token);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.tasks);
  const now = new Date();
  const taskId = task.id || Utilities.getUuid();
  const assignee = task.assignedTo || session.id;
  if (session.role === 'Staff' && assignee !== session.id) {
    throw new Error('Staff can only assign to self / El personal solo puede asignarse a sí mismo');
  }
  const isCommunal = task.isCommunal === true || String(task.isCommunal).toLowerCase() === 'true';
  sheet.appendRow([
    taskId,
    task.projectId || '',
    task.name || 'Untitled',
    task.description || '',
    assignee,
    task.status || 'Pending',
    task.priority || 'Medium',
    task.dueDate ? new Date(task.dueDate) : '',
    isCommunal,
    now,
    now
  ]);
  return { success: true, task: getTaskById(taskId, session) };
}
// End task creation section / Fin de la sección de creación de tareas

function getTasks(token) {
  const session = requireSession(token);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.tasks);
  const rows = sheet.getDataRange().getValues();
  const tasks = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const isCommunal = toBoolean(row[8]);
    const assignedTo = row[4];
    const canView = isCommunal || session.role === 'Admin' || String(assignedTo) === String(session.id);
    if (!canView) continue;
    tasks.push({
      id: row[0],
      projectId: row[1],
      name: row[2],
      description: row[3],
      assignedTo: assignedTo,
      status: row[5],
      priority: row[6],
      dueDate: row[7] instanceof Date ? row[7].toISOString() : row[7],
      isCommunal: isCommunal,
      createdAt: row[9] instanceof Date ? row[9].toISOString() : row[9],
      updatedAt: row[10] instanceof Date ? row[10].toISOString() : row[10]
    });
  }
  tasks.sort(function (a, b) {
    const priorityOrder = { High: 1, Medium: 2, Low: 3 };
    const priorityDiff = (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
    if (priorityDiff !== 0) return priorityDiff;
    const dateA = a.dueDate ? new Date(a.dueDate) : new Date(8640000000000000);
    const dateB = b.dueDate ? new Date(b.dueDate) : new Date(8640000000000000);
    return dateA - dateB;
  });
  return { success: true, tasks: tasks };
}
// End task retrieval section / Fin de la sección de obtención de tareas

function updateTask(task, token) {
  const session = requireSession(token);
  if (!task || !task.id) {
    throw new Error('Task ID required / Se requiere ID de tarea');
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.tasks);
  const rowIndex = findRowIndexById(sheet, task.id);
  if (rowIndex === -1) {
    throw new Error('Task not found / Tarea no encontrada');
  }
  const assignedTo = task.assignedTo || sheet.getRange(rowIndex, 5).getValue();
  if (session.role === 'Staff' && String(assignedTo) !== String(session.id)) {
    throw new Error('Staff cannot reassign others / El personal no puede reasignar a otros');
  }
  const now = new Date();
  const createdAt = sheet.getRange(rowIndex, 10).getValue();
  sheet.getRange(rowIndex, 1, 1, TASK_HEADERS.length).setValues([
    [
      task.id,
      task.projectId || sheet.getRange(rowIndex, 2).getValue(),
      task.name || sheet.getRange(rowIndex, 3).getValue(),
      task.description || sheet.getRange(rowIndex, 4).getValue(),
      assignedTo,
      task.status || sheet.getRange(rowIndex, 6).getValue(),
      task.priority || sheet.getRange(rowIndex, 7).getValue(),
      task.dueDate ? new Date(task.dueDate) : sheet.getRange(rowIndex, 8).getValue(),
      task.isCommunal === undefined ? toBoolean(sheet.getRange(rowIndex, 9).getValue()) : toBoolean(task.isCommunal),
      createdAt,
      now
    ]
  ]);
  return { success: true, task: getTaskById(task.id, session) };
}
// End task update section / Fin de la sección de actualización de tareas

function deleteTask(taskId, token) {
  const session = requireSession(token);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.tasks);
  const rowIndex = findRowIndexById(sheet, taskId);
  if (rowIndex === -1) {
    throw new Error('Task not found / Tarea no encontrada');
  }
  const assignedTo = sheet.getRange(rowIndex, 5).getValue();
  if (session.role === 'Staff' && String(assignedTo) !== String(session.id)) {
    throw new Error('Staff cannot delete this task / El personal no puede eliminar esta tarea');
  }
  if (session.role === 'Manager' && String(assignedTo) !== String(session.id) && !toBoolean(sheet.getRange(rowIndex, 9).getValue())) {
    throw new Error('Managers can only delete communal tasks / Los gerentes solo pueden eliminar tareas comunales');
  }
  sheet.deleteRow(rowIndex);
  return { success: true };
}
// End task deletion section / Fin de la sección de eliminación de tareas

function deleteTasksByProject(projectId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.tasks);
  const lastRow = sheet.getLastRow();
  for (let row = lastRow; row >= 2; row--) {
    if (String(sheet.getRange(row, 2).getValue()) === String(projectId)) {
      sheet.deleteRow(row);
    }
  }
}
// End cascading task deletion section / Fin de la sección de eliminación en cascada de tareas

function startDay(userId, token) {
  const session = requireSession(token);
  const targetUser = resolveUserForLog(session, userId);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.logs);
  const todayKey = new Date();
  const openRow = findOpenLogRow(sheet, targetUser.id, todayKey);
  if (openRow !== -1) {
    throw new Error('Day already started / El día ya fue iniciado');
  }
  const logId = Utilities.getUuid();
  sheet.appendRow([
    logId,
    targetUser.id,
    new Date(todayKey.getFullYear(), todayKey.getMonth(), todayKey.getDate()),
    new Date(),
    '',
    0
  ]);
  return { success: true, logId: logId };
}
// End start day section / Fin de la sección de inicio de día

function endDay(userId, token) {
  const session = requireSession(token);
  const targetUser = resolveUserForLog(session, userId);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.logs);
  const todayKey = new Date();
  const openRow = findOpenLogRow(sheet, targetUser.id, todayKey);
  if (openRow === -1) {
    throw new Error('No open log found / No se encontró registro abierto');
  }
  const startTime = sheet.getRange(openRow, 4).getValue();
  const endTime = new Date();
  const duration = Math.max(0, (endTime - startTime) / 3600000);
  sheet.getRange(openRow, 5, 1, 2).setValues([[endTime, duration]]);
  return { success: true, duration: duration };
}
// End end day section / Fin de la sección de fin de día

function getLogsByUser(userId, token) {
  const session = requireSession(token);
  const targetUser = resolveUserForLog(session, userId);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.logs);
  const rows = sheet.getDataRange().getValues();
  const logs = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[1]) !== String(targetUser.id)) continue;
    logs.push({
      id: row[0],
      userId: row[1],
      date: row[2] instanceof Date ? row[2].toISOString().split('T')[0] : row[2],
      startTime: row[3] instanceof Date ? row[3].toISOString() : row[3],
      endTime: row[4] instanceof Date ? row[4].toISOString() : row[4],
      duration: row[5]
    });
  }
  logs.sort(function (a, b) {
    return new Date(b.startTime || b.date) - new Date(a.startTime || a.date);
  });
  return { success: true, logs: logs };
}
// End log retrieval section / Fin de la sección de obtención de registros

function addUser(name, email, role, language, notifications, token) {
  const session = requireSession(token);
  requireRole(session, ['Admin']);
  if (!name || !email || !role) {
    throw new Error('Missing fields / Faltan campos');
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.users);
  const existingIndex = findRowIndexByEmail(sheet, email);
  if (existingIndex !== -1) {
    throw new Error('User already exists / El usuario ya existe');
  }
  const now = new Date();
  const userId = Utilities.getUuid();
  sheet.appendRow([
    userId,
    name,
    email,
    role,
    '',
    language || 'en',
    notifications || 'Enabled',
    'Light',
    now,
    now,
    true
  ]);
  return { success: true, user: buildUserFromRow(sheet.getRange(sheet.getLastRow(), 1, 1, USERS_HEADERS.length).getValues()[0]) };
}
// End user addition section / Fin de la sección de adición de usuarios

function getUsers(token) {
  const session = requireSession(token);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.users);
  const rows = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    users.push({
      id: row[0],
      name: row[1],
      email: row[2],
      role: row[3],
      language: row[5] || 'en',
      notifications: row[6] || 'Enabled',
      mode: row[7] || 'Light',
      isTemporary: toBoolean(row[10])
    });
  }
  return { success: true, users: users };
}
// End user retrieval section / Fin de la sección de obtención de usuarios

function runDiagnostics(token) {
  if (token) {
    requireSession(token);
  }
  const results = [];
  const ss = SpreadsheetApp.getActive();
  const requiredSheets = [
    { name: SHEET_NAMES.users, headers: USERS_HEADERS },
    { name: SHEET_NAMES.projects, headers: PROJECT_HEADERS },
    { name: SHEET_NAMES.tasks, headers: TASK_HEADERS },
    { name: SHEET_NAMES.logs, headers: TIME_LOG_HEADERS }
  ];
  requiredSheets.forEach(function (item) {
    const sheet = ss.getSheetByName(item.name);
    const exists = !!sheet;
    const headersOk = exists && arraysEqual(sheet.getRange(1, 1, 1, item.headers.length).getValues()[0], item.headers);
    results.push({
      name: item.name,
      exists: exists,
      headers: headersOk
    });
  });
  const adminExists = adminUserExists();
  Logger.log('Diagnostics results: ' + JSON.stringify({ sheets: results, adminExists: adminExists }));
  return { success: true, sheets: results, adminExists: adminExists };
}
// End diagnostics section / Fin de la sección de diagnósticos

function getProjectById(projectId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.projects);
  const rowIndex = findRowIndexById(sheet, projectId);
  if (rowIndex === -1) return null;
  const row = sheet.getRange(rowIndex, 1, 1, PROJECT_HEADERS.length).getValues()[0];
  return {
    id: row[0],
    name: row[1],
    description: row[2],
    status: row[3],
    createdAt: row[4] instanceof Date ? row[4].toISOString() : row[4],
    updatedAt: row[5] instanceof Date ? row[5].toISOString() : row[5]
  };
}
// End project helper section / Fin de la sección de ayuda de proyectos

function getTaskById(taskId, session) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.tasks);
  const rowIndex = findRowIndexById(sheet, taskId);
  if (rowIndex === -1) return null;
  const row = sheet.getRange(rowIndex, 1, 1, TASK_HEADERS.length).getValues()[0];
  const task = {
    id: row[0],
    projectId: row[1],
    name: row[2],
    description: row[3],
    assignedTo: row[4],
    status: row[5],
    priority: row[6],
    dueDate: row[7] instanceof Date ? row[7].toISOString() : row[7],
    isCommunal: toBoolean(row[8]),
    createdAt: row[9] instanceof Date ? row[9].toISOString() : row[9],
    updatedAt: row[10] instanceof Date ? row[10].toISOString() : row[10]
  };
  if (task.isCommunal || session.role === 'Admin' || String(task.assignedTo) === String(session.id)) {
    return task;
  }
  return null;
}
// End task helper section / Fin de la sección de ayuda de tareas

function buildUserFromRow(row) {
  return {
    id: row[0],
    name: row[1],
    email: row[2],
    role: row[3],
    language: row[5] || 'en',
    notifications: row[6] || 'Enabled',
    mode: row[7] || 'Light',
    isTemporary: toBoolean(row[10])
  };
}
// End user builder section / Fin de la sección de construcción de usuario

function updateUserTimestamp(sheet, rowNumber) {
  sheet.getRange(rowNumber, 10).setValue(new Date());
}
// End user timestamp section / Fin de la sección de marcas de tiempo de usuario

function updateUserPassword(sheet, rowNumber, passwordHash, isTemporary) {
  const language = sheet.getRange(rowNumber, 6).getValue() || 'en';
  sheet.getRange(rowNumber, 5).setValue(passwordHash);
  sheet.getRange(rowNumber, 6).setValue(language);
  sheet.getRange(rowNumber, 10).setValue(new Date());
  sheet.getRange(rowNumber, 11).setValue(isTemporary);
}
// End user password update section / Fin de la sección de actualización de contraseña de usuario

function createSession(user) {
  const cache = CacheService.getScriptCache();
  const token = Utilities.getUuid();
  cache.put(buildSessionKey(token), JSON.stringify(user), SESSION_CACHE_SECONDS);
  return token;
}
// End session creation section / Fin de la sección de creación de sesión

function requireSession(token) {
  if (!token) {
    throw new Error('Session expired / Sesión expirada');
  }
  const cache = CacheService.getScriptCache();
  const data = cache.get(buildSessionKey(token));
  if (!data) {
    throw new Error('Session invalid / Sesión inválida');
  }
  return JSON.parse(data);
}
// End session requirement section / Fin de la sección de requisito de sesión

function requireRole(user, allowedRoles) {
  if (allowedRoles.indexOf(user.role) === -1) {
    throw new Error('Insufficient permissions / Permisos insuficientes');
  }
}
// End role enforcement section / Fin de la sección de aplicación de roles

function resolveUserForLog(session, userId) {
  if (userId && userId !== session.id && session.role !== 'Admin' && session.role !== 'Manager') {
    throw new Error('Not allowed / No permitido');
  }
  const targetId = userId || session.id;
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.users);
  const rowIndex = findRowIndexById(sheet, targetId);
  if (rowIndex === -1) {
    throw new Error('User not found / Usuario no encontrado');
  }
  return buildUserFromRow(sheet.getRange(rowIndex, 1, 1, USERS_HEADERS.length).getValues()[0]);
}
// End log user resolution section / Fin de la sección de resolución de usuario para registros

function findOpenLogRow(sheet, userId, dateObj) {
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    if (String(row[1]) !== String(userId)) continue;
    const date = row[2];
    const isSameDay = date instanceof Date && date.getFullYear() === dateObj.getFullYear() && date.getMonth() === dateObj.getMonth() && date.getDate() === dateObj.getDate();
    const noEnd = !row[4];
    if (isSameDay && noEnd) {
      return i + 1;
    }
  }
  return -1;
}
// End open log finder section / Fin de la sección de búsqueda de registro abierto

function hashPassword(password) {
  const raw = password + PASSWORD_SALT;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return bytes.map(function (b) {
    const v = (b & 0xff).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}
// End password hashing section / Fin de la sección de hash de contraseñas

function findRowIndexById(sheet, id) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      return i + 1;
    }
  }
  return -1;
}
// End row lookup by ID section / Fin de la sección de búsqueda por ID

function findRowIndexByEmail(sheet, email) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]).toLowerCase() === String(email).toLowerCase()) {
      return i + 1;
    }
  }
  return -1;
}
// End row lookup by email section / Fin de la sección de búsqueda por correo

function buildSessionKey(token) {
  return 'session::' + token;
}
// End session key builder section / Fin de la sección de construcción de claves de sesión

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  const str = String(value).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes' || str === 'si';
}
// End boolean coercion section / Fin de la sección de conversión booleana

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
// End array comparison section / Fin de la sección de comparación de arreglos

function adminUserExists() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.users);
  if (!sheet) return false;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][3] === 'Admin') {
      return true;
    }
  }
  return false;
}
function doGetManifest() {
  return ContentService.createTextOutput(
    HtmlService.createHtmlOutputFromFile("manifest").getContent()
  ).setMimeType(ContentService.MimeType.JSON);
}

function doGetServiceWorker() {
  return ContentService.createTextOutput(
    HtmlService.createHtmlOutputFromFile("serviceworker").getContent()
  ).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// End admin verification section / Fin de la sección de verificación de administrador
