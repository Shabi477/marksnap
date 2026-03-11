import { useState, useEffect } from 'react';
import { questionsAPI, topicsAPI, subjectsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState('questions');
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Question form
  const [showForm, setShowForm] = useState(false);
  const [editingQ, setEditingQ] = useState(null);
  const [form, setForm] = useState({
    topic_id: '', subject_id: '', question_text: '',
    option_a: '', option_b: '', option_c: '', option_d: '',
    correct_answer: 'A', difficulty: 'medium', year_group: '', key_stage: 'KS3',
    explanation: '', source: 'system', num_options: 4,
  });

  // Topic form
  const [topicForm, setTopicForm] = useState({ name: '', order_index: 0 });
  const [showTopicForm, setShowTopicForm] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    subjectsAPI.list().then(r => setSubjects(r.data));
  }, []);

  useEffect(() => {
    if (selectedSubject) {
      loadTopics();
      loadQuestions();
    }
  }, [selectedSubject]);

  const loadTopics = async () => {
    const r = await topicsAPI.list(selectedSubject);
    setTopics(r.data);
  };

  const loadQuestions = async () => {
    setLoading(true);
    const r = await questionsAPI.list({ subject_id: selectedSubject, limit: 200 });
    setQuestions(r.data);
    setLoading(false);
  };

  const resetForm = () => {
    setForm({
      topic_id: '', subject_id: selectedSubject || '', question_text: '',
      option_a: '', option_b: '', option_c: '', option_d: '',
      correct_answer: 'A', difficulty: 'medium', year_group: '', key_stage: 'KS3',
      explanation: '', source: 'system', num_options: 4,
    });
    setEditingQ(null);
    setShowForm(false);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      topic_id: Number(form.topic_id),
      subject_id: Number(form.subject_id || selectedSubject),
      num_options: Number(form.num_options),
    };
    try {
      if (editingQ) {
        await questionsAPI.update(editingQ.id, payload);
      } else {
        await questionsAPI.create(payload);
      }
      resetForm();
      loadQuestions();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save question');
    }
  };

  const handleEditQuestion = (q) => {
    setForm({
      topic_id: q.topic_id, subject_id: q.subject_id, question_text: q.question_text,
      option_a: q.option_a, option_b: q.option_b, option_c: q.option_c || '', option_d: q.option_d || '',
      correct_answer: q.correct_answer, difficulty: q.difficulty, year_group: q.year_group || '',
      key_stage: q.key_stage || 'KS3', explanation: q.explanation || '', source: q.source,
      num_options: q.num_options,
    });
    setEditingQ(q);
    setShowForm(true);
  };

  const handleDeleteQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    await questionsAPI.delete(id);
    loadQuestions();
  };

  const handleSaveTopic = async (e) => {
    e.preventDefault();
    try {
      await topicsAPI.create(selectedSubject, topicForm);
      setTopicForm({ name: '', order_index: 0 });
      setShowTopicForm(false);
      loadTopics();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create topic');
    }
  };

  const handleDeleteTopic = async (topicId) => {
    if (!window.confirm('Delete this topic? Only works if it has no active questions.')) return;
    try {
      await topicsAPI.delete(selectedSubject, topicId);
      loadTopics();
    } catch (err) {
      alert(err.response?.data?.detail || 'Cannot delete topic');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Admin Panel</h2>
        <p className="text-gray-500">You need super admin access to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Super Admin Panel</h1>

      {/* Subject selector */}
      <div className="flex items-center gap-4">
        <select
          value={selectedSubject || ''}
          onChange={e => setSelectedSubject(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border-gray-300 text-sm"
        >
          <option value="">Select Subject</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {['topics', 'questions'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${
                tab === t ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {!selectedSubject ? (
        <div className="text-center py-12 text-gray-500">Select a subject to manage</div>
      ) : tab === 'topics' ? (
        /* ---- TOPICS TAB ---- */
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Topics</h2>
            <button
              onClick={() => setShowTopicForm(!showTopicForm)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              + Add Topic
            </button>
          </div>

          {showTopicForm && (
            <form onSubmit={handleSaveTopic} className="bg-white rounded-xl shadow-sm border p-4 flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Topic Name</label>
                <input
                  value={topicForm.name}
                  onChange={e => setTopicForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  required
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-gray-500 mb-1">Order</label>
                <input
                  type="number"
                  value={topicForm.order_index}
                  onChange={e => setTopicForm(f => ({ ...f, order_index: Number(e.target.value) }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                Save
              </button>
              <button type="button" onClick={() => setShowTopicForm(false)} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">
                Cancel
              </button>
            </form>
          )}

          <div className="bg-white rounded-xl shadow-sm border divide-y">
            {topics.length === 0 ? (
              <div className="p-4 text-gray-500 text-center text-sm">No topics yet</div>
            ) : topics.map(t => (
              <div key={t.id} className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900">{t.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{t.question_count} questions</span>
                </div>
                <button
                  onClick={() => handleDeleteTopic(t.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ---- QUESTIONS TAB ---- */
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Questions ({questions.length})</h2>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              + Add Question
            </button>
          </div>

          {/* Question Form */}
          {showForm && (
            <form onSubmit={handleSaveQuestion} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
              <h3 className="font-medium">{editingQ ? 'Edit Question' : 'New Question'}</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Topic</label>
                  <select
                    value={form.topic_id}
                    onChange={e => setForm(f => ({ ...f, topic_id: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                    required
                  >
                    <option value="">Select Topic</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Year Group</label>
                  <select
                    value={form.year_group}
                    onChange={e => setForm(f => ({ ...f, year_group: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    <option value="">Select</option>
                    {['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13'].map(y =>
                      <option key={y} value={y}>{y}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Question Text</label>
                <textarea
                  value={form.question_text}
                  onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  rows={2}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {['A', 'B', 'C', 'D'].map(letter => (
                  <div key={letter}>
                    <label className="block text-xs text-gray-500 mb-1">Option {letter}</label>
                    <input
                      value={form[`option_${letter.toLowerCase()}`]}
                      onChange={e => setForm(f => ({ ...f, [`option_${letter.toLowerCase()}`]: e.target.value }))}
                      className="w-full rounded-lg border-gray-300 text-sm"
                      required={letter === 'A' || letter === 'B'}
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Correct Answer</label>
                  <select
                    value={form.correct_answer}
                    onChange={e => setForm(f => ({ ...f, correct_answer: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    {['A', 'B', 'C', 'D'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Key Stage</label>
                  <select
                    value={form.key_stage}
                    onChange={e => setForm(f => ({ ...f, key_stage: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    {['KS1', 'KS2', 'KS3', 'KS4', 'KS5'].map(ks => <option key={ks} value={ks}>{ks}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Explanation (optional)</label>
                <textarea
                  value={form.explanation}
                  onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                  {editingQ ? 'Update' : 'Create'} Question
                </button>
                <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Question List */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border divide-y">
              {questions.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">No questions yet. Add some!</div>
              ) : questions.map((q, idx) => (
                <div key={q.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">#{idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          q.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                          q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>{q.difficulty}</span>
                        {q.topic_name && <span className="text-xs text-indigo-600">{q.topic_name}</span>}
                        {q.year_group && <span className="text-xs text-gray-500">{q.year_group}</span>}
                      </div>
                      <p className="text-sm text-gray-900 mb-1">{q.question_text}</p>
                      <div className="flex gap-3 text-xs text-gray-500">
                        {['A', 'B', 'C', 'D'].map(l => {
                          const opt = q[`option_${l.toLowerCase()}`];
                          if (!opt) return null;
                          return (
                            <span key={l} className={q.correct_answer === l ? 'text-green-700 font-medium' : ''}>
                              {l}) {opt} {q.correct_answer === l ? '✓' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-3">
                      <button
                        onClick={() => handleEditQuestion(q)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
