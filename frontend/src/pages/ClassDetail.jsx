import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { classesAPI } from '../services/api';
import Spinner from '../components/Spinner';
import { ArrowLeft, Plus, Upload, User, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClassDetail() {
  const { classId } = useParams();
  const [students, setStudents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStudents = () => {
    classesAPI.getStudents(classId)
      .then((res) => setStudents(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStudents(); }, [classId]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      await classesAPI.addStudent(classId, { name, student_code: code || undefined });
      toast.success(`${name} added!`);
      setName('');
      setCode('');
      setShowForm(false);
      loadStudents();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add student');
    }
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await classesAPI.uploadStudentsCSV(classId, file);
      toast.success(res.data.message);
      loadStudents();
    } catch (err) {
      toast.error('Failed to upload CSV');
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/classes" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="page-title">Class Students</h1>
          <p className="page-subtitle">{students.length} students enrolled</p>
        </div>
        <div className="flex gap-2">
          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload CSV
            <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
          </label>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {/* CSV info */}
      <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 text-sm text-brand-800">
        <strong>CSV Format:</strong> Upload a CSV file with columns <code className="bg-brand-100 px-1 rounded">name</code> and optionally <code className="bg-brand-100 px-1 rounded">student_code</code>. Student codes will be auto-generated if not provided.
      </div>

      {/* Add student form */}
      {showForm && (
        <form onSubmit={handleAddStudent} className="card flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Student Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="John Smith"
              required
            />
          </div>
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">ID Code (optional)</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input-field"
              placeholder="Auto-generated"
            />
          </div>
          <button type="submit" className="btn-primary">Add</button>
          <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
        </form>
      )}

      {/* Students list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Spinner />
        </div>
      ) : students.length === 0 ? (
        <div className="card text-center py-12">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No students yet</h3>
          <p className="text-gray-500 mt-1">Add students individually or upload a CSV file.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Code</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {students.map((student, idx) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{idx + 1}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                        <span className="text-xs font-semibold text-brand-600">
                          {student.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {student.student_code}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
