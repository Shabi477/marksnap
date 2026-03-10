import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { classesAPI } from '../services/api';
import { Users, Plus, Trash2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Classes() {
  const [classes, setClasses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(true);

  const loadClasses = () => {
    classesAPI.list()
      .then((res) => setClasses(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadClasses(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await classesAPI.create({ name, academic_year: year });
      toast.success(`Class "${name}" created!`);
      setName('');
      setShowForm(false);
      loadClasses();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create class');
    }
  };

  const handleDelete = async (id, className) => {
    if (!window.confirm(`Delete class "${className}" and all its students?`)) return;
    try {
      await classesAPI.delete(id);
      toast.success('Class deleted');
      loadClasses();
    } catch (err) {
      toast.error('Failed to delete class');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Classes</h1>
          <p className="page-subtitle">Manage your classes and students</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Class
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="e.g. Year 8 Maths Set 1"
              required
            />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="input-field"
              placeholder="2026"
              required
            />
          </div>
          <button type="submit" className="btn-primary">Create</button>
          <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
        </form>
      )}

      {/* Classes grid */}
      {classes.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No classes yet</h3>
          <p className="text-gray-500 mt-1">Create your first class to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <div key={cls.id} className="card group">
              <div className="flex items-start justify-between">
                <Link to={`/classes/${cls.id}`} className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                      <Users className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                        {cls.name}
                      </h3>
                      <p className="text-sm text-gray-500">{cls.academic_year}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {cls.student_count} student{cls.student_count !== 1 ? 's' : ''}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                  </div>
                </Link>
                <button
                  onClick={() => handleDelete(cls.id, cls.name)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
