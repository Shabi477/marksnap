import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { testsAPI } from '../services/api';
import { FileText, Plus, Trash2, ArrowRight, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [testName, setTestName] = useState('');
  const [sections, setSections] = useState([
    { section_name: 'A', num_questions: 20, num_options: 4, page_number: 1 },
  ]);
  const [loading, setLoading] = useState(true);

  const loadTests = () => {
    testsAPI.list()
      .then((res) => setTests(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadTests(); }, []);

  const addSection = () => {
    const nextLetter = String.fromCharCode(65 + sections.length); // A, B, C, ...
    setSections([...sections, {
      section_name: nextLetter,
      num_questions: 10,
      num_options: 4,
      page_number: sections.length + 1,
    }]);
  };

  const removeSection = (idx) => {
    setSections(sections.filter((_, i) => i !== idx));
  };

  const updateSection = (idx, field, value) => {
    const updated = [...sections];
    updated[idx] = { ...updated[idx], [field]: value };
    setSections(updated);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await testsAPI.create({ name: testName, sections });
      toast.success(`Test "${testName}" created!`);
      setTestName('');
      setSections([{ section_name: 'A', num_questions: 20, num_options: 4, page_number: 1 }]);
      setShowForm(false);
      loadTests();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create test');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete test "${name}"?`)) return;
    try {
      await testsAPI.delete(id);
      toast.success('Test deleted');
      loadTests();
    } catch (err) {
      toast.error('Failed to delete test');
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
          <h1 className="page-title">Tests</h1>
          <p className="page-subtitle">Create tests and generate answer sheets</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Test
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Test Name</label>
            <input
              type="text"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              className="input-field max-w-md"
              placeholder="e.g. Year 8 Maths Chapter 5 Quiz"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">Sections</label>
              <button type="button" onClick={addSection} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                + Add Section
              </button>
            </div>

            <div className="space-y-3">
              {sections.map((sec, idx) => (
                <div key={idx} className="flex items-end gap-3 p-4 bg-gray-50 rounded-lg">
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={sec.section_name}
                      onChange={(e) => updateSection(idx, 'section_name', e.target.value)}
                      className="input-field text-center"
                      required
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Questions</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={sec.num_questions}
                      onChange={(e) => updateSection(idx, 'num_questions', parseInt(e.target.value) || 1)}
                      className="input-field"
                      required
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Options</label>
                    <select
                      value={sec.num_options}
                      onChange={(e) => updateSection(idx, 'num_options', parseInt(e.target.value))}
                      className="input-field"
                    >
                      <option value={4}>A–D (4)</option>
                      <option value={5}>A–E (5)</option>
                      <option value={3}>A–C (3)</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Page</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={sec.page_number}
                      onChange={(e) => updateSection(idx, 'page_number', parseInt(e.target.value) || 1)}
                      className="input-field"
                    />
                  </div>
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSection(idx)}
                      className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="btn-primary">Create Test</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Tests grid */}
      {tests.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No tests yet</h3>
          <p className="text-gray-500 mt-1">Create your first test to generate answer sheets.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tests.map((test) => {
            const totalQ = test.sections?.reduce((sum, s) => sum + s.num_questions, 0) || 0;
            return (
              <div key={test.id} className="card group">
                <div className="flex items-start justify-between">
                  <Link to={`/tests/${test.id}`} className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                        <FileText className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                          {test.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {test.sections?.length} section(s) • {totalQ} questions
                        </p>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => handleDelete(test.id, test.name)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    {new Date(test.created_at).toLocaleDateString()}
                  </p>
                  <Link
                    to={`/tests/${test.id}`}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                  >
                    Manage <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
