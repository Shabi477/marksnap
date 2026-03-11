import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { schoolAPI, testsAPI, subjectsAPI } from '../services/api';
import {
  Building2, Users, Copy, RefreshCw, Plus, Trash2, Upload,
  Search, ArrowRightLeft, UserPlus, BookOpen, Send,
  ClipboardList, Filter, X, GraduationCap,
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
  const [newClassKeyStage, setNewClassKeyStage] = useState('');
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignClassId, setAssignClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [transferStudentId, setTransferStudentId] = useState('');
  const [transferClassId, setTransferClassId] = useState('');

  // Tests state
  const [tests, setTests] = useState([]);
  const [yearGroups, setYearGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [pushTestId, setPushTestId] = useState('');
  const [pushClassIds, setPushClassIds] = useState([]);
  const [pushTeacherIds, setPushTeacherIds] = useState([]);
  const [pushYearGroups, setPushYearGroups] = useState([]);
  const [filterTestId, setFilterTestId] = useState('');

  // Year group filter for classes tab
  const [classYearFilter, setClassYearFilter] = useState('');

  // Subjects state
  const [subjects, setSubjects] = useState([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assignSubjectTeacherId, setAssignSubjectTeacherId] = useState('');
  const [assignSubjectIsHod, setAssignSubjectIsHod] = useState(false);

  const loadData = async () => {
    try {
      const [schoolRes, teacherRes, classRes, testsRes, yearRes, assignRes, subjectsRes] = await Promise.all([
        schoolAPI.getInfo(),
        schoolAPI.getTeachers(),
        schoolAPI.getClasses(),
        testsAPI.list(),
        schoolAPI.getYearGroups().catch(() => ({ data: [] })),
        schoolAPI.getTestAssignments().catch(() => ({ data: [] })),
        subjectsAPI.list().catch(() => ({ data: [] })),
      ]);
      setSchool(schoolRes.data);
      setTeachers(teacherRes.data);
      setClasses(classRes.data);
      setTests(testsRes.data);
      setYearGroups(yearRes.data);
      setAssignments(assignRes.data);
      setSubjects(subjectsRes.data);
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
      await schoolAPI.createClass({ name: newClassName, academic_year: newClassYear, key_stage: newClassKeyStage || undefined });
      toast.success(`Class "${newClassName}" created`);
      setNewClassName('');
      setNewClassKeyStage('');
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

  const handlePushTest = async (e) => {
    e.preventDefault();
    if (!pushTestId) return;
    if (!pushClassIds.length && !pushTeacherIds.length && !pushYearGroups.length) {
      toast.error('Select at least one target (classes, teachers, or year groups)');
      return;
    }
    try {
      await schoolAPI.pushTest({
        test_id: parseInt(pushTestId),
        class_ids: pushClassIds.map(Number),
        teacher_ids: pushTeacherIds.map(Number),
        year_groups: pushYearGroups,
      });
      toast.success('Test assigned successfully');
      setPushTestId('');
      setPushClassIds([]);
      setPushTeacherIds([]);
      setPushYearGroups([]);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to push test');
    }
  };

  const handleDeleteAssignment = async (id) => {
    try {
      await schoolAPI.deleteTestAssignment(id);
      toast.success('Assignment removed');
      loadData();
    } catch {
      toast.error('Failed to remove assignment');
    }
  };

  const toggleMultiSelect = (value, list, setter) => {
    if (list.includes(value)) {
      setter(list.filter((v) => v !== value));
    } else {
      setter([...list, value]);
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
    { key: 'subjects', label: 'Subjects', icon: GraduationCap },
    { key: 'tests', label: 'Tests', icon: ClipboardList },
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2">School Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p className="font-medium text-gray-900 capitalize">{school?.school_type || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Region</p>
                <p className="font-medium text-gray-900">{school?.region || 'UK'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Plan</p>
                <p className="font-medium text-gray-900 capitalize">{school?.tier || 'Free'}</p>
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
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">Key Stage</label>
              <select
                value={newClassKeyStage}
                onChange={(e) => setNewClassKeyStage(e.target.value)}
                className="input-field"
              >
                <option value="">None</option>
                <option value="KS1">KS1</option>
                <option value="KS2">KS2</option>
                <option value="KS3">KS3</option>
                <option value="KS4">KS4</option>
                <option value="KS5">KS5</option>
              </select>
            </div>
            <button type="submit" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create
            </button>
          </form>

          {/* Year Group Filter */}
          {yearGroups.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => setClassYearFilter('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  !classYearFilter ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {yearGroups.map((yg) => (
                <button
                  key={yg}
                  onClick={() => setClassYearFilter(yg)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    classYearFilter === yg ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {yg}
                </button>
              ))}
            </div>
          )}

          {classes.length === 0 ? (
            <div className="card text-center py-12">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No classes yet</h3>
              <p className="text-gray-500 mt-1">Create classes or import from Excel.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {classes
                .filter((cls) => !classYearFilter || cls.academic_year === classYearFilter)
                .map((cls) => (
                <div key={cls.id} className="card flex items-center justify-between py-4">
                  <div>
                    <h4 className="font-semibold text-gray-900">{cls.name}</h4>
                    <p className="text-sm text-gray-500">
                      {cls.academic_year}
                      {cls.key_stage && <span> &bull; {cls.key_stage}</span>}
                      {' '}&bull; {cls.student_count} students
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

      {/* Subjects Tab */}
      {tab === 'subjects' && (
        <div className="space-y-4">
          {/* Create Subject */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newSubjectName.trim()) return;
              try {
                await subjectsAPI.create({ name: newSubjectName });
                toast.success(`Subject "${newSubjectName}" created`);
                setNewSubjectName('');
                loadData();
              } catch (err) {
                toast.error(err.response?.data?.detail || 'Failed to create subject');
              }
            }}
            className="card flex flex-col sm:flex-row gap-4 items-end"
          >
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
              <input
                type="text"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                className="input-field"
                placeholder="e.g. History"
                required
              />
            </div>
            <button type="submit" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Subject
            </button>
          </form>

          {/* Assign Teacher to Subject */}
          {subjects.filter((s) => !s.is_default || teacher.role === 'hod').length > 0 && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!assignSubjectId || !assignSubjectTeacherId) return;
                try {
                  await subjectsAPI.assignTeacher(parseInt(assignSubjectId), {
                    teacher_id: parseInt(assignSubjectTeacherId),
                    is_hod: assignSubjectIsHod,
                  });
                  toast.success('Teacher assigned to subject');
                  setAssignSubjectId('');
                  setAssignSubjectTeacherId('');
                  setAssignSubjectIsHod(false);
                  loadData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to assign');
                }
              }}
              className="card space-y-4"
            >
              <h3 className="text-sm font-semibold text-gray-900">Assign Teacher to Subject</h3>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select
                    value={assignSubjectId}
                    onChange={(e) => setAssignSubjectId(e.target.value)}
                    className="input-field"
                    required
                  >
                    <option value="">Select subject...</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.is_default ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                  <select
                    value={assignSubjectTeacherId}
                    onChange={(e) => setAssignSubjectTeacherId(e.target.value)}
                    className="input-field"
                    required
                  >
                    <option value="">Select teacher...</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                  <input
                    type="checkbox"
                    checked={assignSubjectIsHod}
                    onChange={(e) => setAssignSubjectIsHod(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  HOD
                </label>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Assign
                </button>
              </div>
            </form>
          )}

          {/* Subject List */}
          {subjects.length === 0 ? (
            <div className="card text-center py-12">
              <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No subjects yet</h3>
              <p className="text-gray-500 mt-1">Default subjects will appear on next restart.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map((s) => (
                <div key={s.id} className="card flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900">{s.name}</h4>
                      {s.is_default && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {s.teacher_count} teacher{s.teacher_count !== 1 ? 's' : ''}
                      {s.hod_names?.length > 0 && (
                        <span> &bull; HOD: {s.hod_names.join(', ')}</span>
                      )}
                    </p>
                  </div>
                  {!s.is_default && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Delete subject "${s.name}"?`)) return;
                        try {
                          await subjectsAPI.delete(s.id);
                          toast.success('Subject deleted');
                          loadData();
                        } catch {
                          toast.error('Failed to delete subject');
                        }
                      }}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tests Tab */}
      {tab === 'tests' && (
        <div className="space-y-4">
          {/* Push Test Form */}
          <form onSubmit={handlePushTest} className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Push Test to Classes / Teachers / Year Groups</h3>

            {/* Select Test */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test</label>
              <select
                value={pushTestId}
                onChange={(e) => setPushTestId(e.target.value)}
                className="input-field"
                required
              >
                <option value="">Select a test...</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Select Classes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Classes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleMultiSelect(String(c.id), pushClassIds, setPushClassIds)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      pushClassIds.includes(String(c.id))
                        ? 'bg-brand-100 text-brand-700 border-brand-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Select Year Groups */}
            {yearGroups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Year Groups <span className="text-gray-400 font-normal">(optional — pushes to all classes in year)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {yearGroups.map((yg) => (
                    <button
                      key={yg}
                      type="button"
                      onClick={() => toggleMultiSelect(yg, pushYearGroups, setPushYearGroups)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                        pushYearGroups.includes(yg)
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {yg}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Select Teachers */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teachers <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {teachers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleMultiSelect(String(t.id), pushTeacherIds, setPushTeacherIds)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      pushTeacherIds.includes(String(t.id))
                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="btn-primary flex items-center gap-2">
              <Send className="w-4 h-4" /> Push Test
            </button>
          </form>

          {/* Existing Assignments */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Test Assignments</h3>
              {tests.length > 0 && (
                <select
                  value={filterTestId}
                  onChange={(e) => setFilterTestId(e.target.value)}
                  className="input-field w-48 text-sm"
                >
                  <option value="">All tests</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {assignments.length === 0 ? (
              <div className="text-center py-8">
                <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No test assignments yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {assignments
                  .filter((a) => !filterTestId || a.test_id === parseInt(filterTestId))
                  .map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.test_name}</p>
                      <p className="text-xs text-gray-500">
                        {a.class_name && <span className="inline-flex items-center gap-1 mr-2"><BookOpen className="w-3 h-3" /> {a.class_name}</span>}
                        {a.teacher_name && <span className="inline-flex items-center gap-1 mr-2"><Users className="w-3 h-3" /> {a.teacher_name}</span>}
                        {a.year_group && <span className="inline-flex items-center gap-1 mr-2"><Filter className="w-3 h-3" /> Year {a.year_group}</span>}
                        &bull; by {a.assigned_by_name}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteAssignment(a.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
