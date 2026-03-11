import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
});

// Add auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('marksnap_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('marksnap_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  registerSchool: (data) => api.post('/auth/register-school', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// --- School (HOD) ---
export const schoolAPI = {
  getInfo: () => api.get('/school/'),
  getInviteCode: () => api.get('/school/invite-code'),
  regenerateInvite: () => api.post('/school/regenerate-invite'),
  getTeachers: () => api.get('/school/teachers'),
  getClasses: () => api.get('/school/classes'),
  createClass: (data) => api.post('/school/classes', data),
  deleteClass: (id) => api.delete(`/school/classes/${id}`),
  assignTeacher: (data) => api.post('/school/assign-teacher', data),
  unassignTeacher: (teacherId, classId) =>
    api.delete('/school/unassign-teacher', { data: { teacher_id: teacherId, class_id: classId } }),
  importClasses: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/school/import-classes', formData);
  },
  searchStudents: (q) => api.get(`/school/students/search?q=${encodeURIComponent(q)}`),
  transferStudent: (data) => api.post('/school/students/transfer', data),
  getYearGroups: () => api.get('/school/year-groups'),
  pushTest: (data) => api.post('/school/push-test', data),
  getTestAssignments: (testId = null) => {
    const params = testId ? `?test_id=${testId}` : '';
    return api.get(`/school/test-assignments${params}`);
  },
  deleteTestAssignment: (id) => api.delete(`/school/test-assignments/${id}`),
};

// --- Classes ---
export const classesAPI = {
  list: () => api.get('/classes/'),
  create: (data) => api.post('/classes/', data),
  delete: (id) => api.delete(`/classes/${id}`),
  getStudents: (classId) => api.get(`/classes/${classId}/students`),
  addStudent: (classId, data) => api.post(`/classes/${classId}/students`, data),
  uploadStudentsCSV: (classId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/classes/${classId}/students/upload`, formData);
  },
};

// --- Tests ---
export const testsAPI = {
  list: () => api.get('/tests/'),
  create: (data) => api.post('/tests/', data),
  get: (id) => api.get(`/tests/${id}`),
  delete: (id) => api.delete(`/tests/${id}`),
  setAnswerKey: (testId, data) => api.post(`/tests/${testId}/answer-key`, data),
  getAnswerKey: (testId) => api.get(`/tests/${testId}/answer-key`),
  downloadSheets: (testId, classId) =>
    api.get(`/tests/${testId}/sheets/${classId}`, { responseType: 'blob' }),
};

// --- Scanning ---
export const scanAPI = {
  upload: (testId, files, classId = null) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const params = classId ? `?class_id=${classId}` : '';
    return api.post(`/scan/upload/${testId}${params}`, formData);
  },
  listBatches: (testId) => api.get(`/scan/batches/${testId}`),
  batchStatus: (batchId) => api.get(`/scan/batch/${batchId}/status`),
  getFlagged: (batchId) => api.get(`/scan/batch/${batchId}/flagged`),
  correctResult: (resultId, selectedAnswer) =>
    api.put(`/scan/result/${resultId}/correct`, { selected_answer: selectedAnswer }),
  scanLive: (testId, imageBlob) => {
    const formData = new FormData();
    formData.append('file', imageBlob, 'scan.jpg');
    return api.post(`/scan/live/${testId}`, formData);
  },
};

// --- Results ---
export const resultsAPI = {
  get: (testId, classId = null) => {
    const params = classId ? `?class_id=${classId}` : '';
    return api.get(`/results/${testId}${params}`);
  },
  export: (testId, classId = null) => {
    const params = classId ? `?class_id=${classId}` : '';
    return api.get(`/results/${testId}/export${params}`, { responseType: 'blob' });
  },
};

export default api;
