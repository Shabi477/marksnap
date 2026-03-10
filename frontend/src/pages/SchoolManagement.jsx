import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { schoolAPI } from '../services/api';
import {
  Building2, Users, Copy, RefreshCw, Plus, Trash2, Upload,
  Search, ArrowRightLeft, UserPlus, UserMinus, BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SchoolManagement() {
  const { teacher } = useAuth();
  const [tab, setTab] = useState('overview');
  const [school, setSchool] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [newClassName, setNewClassName] = useState('');
  const [newClassYear, setNewClassYear] = useState(new Date().getFullYear().toString());
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignClassId, setAssignClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [transferStudentId, setTransferStudentId] = useState('');
  const [transferClassId, setTransferClassId] = useState('');

  const loadData = async () => {
    try {
      const [schoolRes, teacherRes, classRes] = await Promise.all([
        schoolAPI.getInfo(),
        schoolAPI.getTeachers(),
        schoolAPI.getClasses(),
      ]);
      setSchool(schoolRes.data);
      setTeachers(teacherRes.data);
      setClasses(classRes.data);
    } catch {
      toast.error('Failed to load school data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const copyInviteCode = () => {
    if (school?.invite_code) {
      navigator.clipboard.writeText(school.invite_code);
      toast.success('Invite code copied!');
    }
  };

  const regenerateCode = async () => {
    try {
      const res = await schoolAPI.regenerateInvite();
      setSchool((s) => ({ ...s, invite_code: res.data.invite_code }));
      toast.success('New invite code generated');
    } catch {
      toast.error('Failed to regenerate');
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    try {
      await schoolAPI.createClass({ name: newClassName, academic_year: newClassYear });
      toast.success(`Class "${newClassName}" created`);
      setNewClassName('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create class');
    }
  };

  const handleDeleteClass = async (id, name) => {
    if (!window.confirm(`Delete class "${name}" and all its students?`)) return;
    try {
      await schoolAPI.deleteClass(id);
      toast.success('Class deleted');
      loadData();
    } catch {
      toast.error('Failed to delete class');
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignTeacherId || !assignClassId) return;
    try {
      await schoolAPI.assignTeacher({
        teacher_id: parseInt(assignTeacherId),
        class_id: parseInt(assignClassId),
      });
      toast.success('Teacher assigned to class');
      setAssignTeacherId('');
      setAssignClassId('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to assign');
    }
  };

  const handleUnassign = async (teacherId, classId) => {
    try {
      await schoolAPI.unassignTeacher(teacherId, classId);
      toast.success('Teacher unassigned');
      loadData();
    } catch {
      toast.error('Failed to unassign');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await schoolAPI.importClasses(file);
      toast.success(res.data.message);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    }
    e.target.value = '';
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await schoolAPI.searchStudents(searchQuery);
      setSearchResults(res.data);
    } catch {
      toast.error('Search failed');
    }
  };

  const handleTransfer = async () => {
    if (!transferStudentId || !transferClassId) return;
    try {
      await schoolAPI.transferStudent({
        student_id: parseInt(transferStudentId),
        new_class_id: parseInt(transferClassId),
      });
      toast.success('Student transferred');
      setTransferStudentId('');
      setTransferClassId('');
      setSearchResults([]);
      setSearchQuery('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Transfer failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Building2 },
    { key: 'classes', label: 'Classes', icon: BookOpen },
    { key: 'teachers', label: 'Teachers', icon: Users },
    { key: 'students', label: 'Students', icon: Search },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{school?.name || 'School Management'}</h1>
        <p className="page-subtitle">Manage classes, teachers, and students</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{teachers.length}</p>
                  <p className="text-sm text-gray-500">Teachers</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{classes.length}</p>
                  <p className="text-sm text-gray-500">Classes</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {classes.reduce((sum, c) => sum + (c.student_count || 0), 0)}
                  </p>
                  <p className="text-sm text-gray-500">Students</p>
                </div>
              </div>
            </div>
          </div>

          {/* Invite Code */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Invite Code</h3>
            <p className="text-sm text-gray-500 mb-4">
              Share this code with teachers so they can join your school when they register.
            </p>
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 px-6 py-3 rounded-lg">
                <span className="text-2xl font-mono font-bold text-brand-600 tracking-wider">
                  {school?.invite_code}
                </span>
              </div>
              <button onClick={copyInviteCode} className="btn-secondary flex items-center gap-2">
                <Copy className="w-4 h-4" /> Copy
              </button>
              <button onClick={regenerateCode} className="btn-secondary flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
            </div>
          </div>

          {/* Excel Import */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Import Classes from Excel</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload an Excel file with columns: <code className="bg-gray-100 px-1 rounded">Class</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">Student Name</code>, and optionally{' '}
              <code className="bg-gray-100 px-1 rounded">Student ID</code>.
            </p>
            <label className="btn-secondary inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" /> Upload Excel
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {/* Classes Tab */}
      {tab === 'classes' && (
        <div className="space-y-4">
          <form onSubmit={handleCreateClass} className="card flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                className="input-field"
                placeholder="e.g. Year 8 Maths Set 1"
                required
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <input
                type="text"
                value={newClassYear}
                onChange={(e) => setNewClassYear(e.target.value)}
                className="input-field"
              />
            </div>
            <button type="submit" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create
            </button>
          </form>

          {classes.length === 0 ? (
            <div className="card text-center py-12">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No classes yet</h3>
              <p className="text-gray-500 mt-1">Create classes or import from Excel.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {classes.map((cls) => (
                <div key={cls.id} className="card flex items-center justify-between py-4">
                  <div>
                    <h4 className="font-semibold text-gray-900">{cls.name}</h4>
                    <p className="text-sm text-gray-500">
                      {cls.academic_year} &bull; {cls.student_count} students
                      {cls.teacher_names?.length > 0 && (
                        <span> &bull; {cls.teacher_names.join(', ')}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteClass(cls.id, cls.name)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Teachers Tab */}
      {tab === 'teachers' && (
        <div className="space-y-4">
          {/* Assign Form */}
          <form onSubmit={handleAssign} className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Assign Teacher to Class</h3>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                <select
                  value={assignTeacherId}
                  onChange={(e) => setAssignTeacherId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select teacher...</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <select
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select class...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Assign
              </button>
            </div>
          </form>

          {/* Teacher List */}
          {teachers.length === 0 ? (
            <div className="card text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No teachers yet</h3>
              <p className="text-gray-500 mt-1">Share your invite code to let teachers join.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teachers.map((t) => (
                <div key={t.id} className="card py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold text-brand-600">
                          {t.name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{t.name}</p>
                        <p className="text-sm text-gray-500">{t.email}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      t.role === 'hod'
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {t.role === 'hod' ? 'HOD' : 'Teacher'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Students Tab */}
      {tab === 'students' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Search Students</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input-field flex-1"
                placeholder="Search by name or student code..."
              />
              <button onClick={handleSearch} className="btn-primary flex items-center gap-2">
                <Search className="w-4 h-4" /> Search
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Results ({searchResults.length})
              </h3>
              <div className="space-y-2">
                {searchResults.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.student_code} &bull; {s.class_name}</p>
                    </div>
                    <button
                      onClick={() => setTransferStudentId(String(s.id))}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                    >
                      <ArrowRightLeft className="w-3 h-3" /> Transfer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transferStudentId && (
            <div className="card border-brand-200 bg-brand-50">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Transfer Student
              </h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Move to Class</label>
                  <select
                    value={transferClassId}
                    onChange={(e) => setTransferClassId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Select class...</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleTransfer}
                  disabled={!transferClassId}
                  className="btn-primary flex items-center gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" /> Transfer
                </button>
                <button
                  onClick={() => { setTransferStudentId(''); setTransferClassId(''); }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
