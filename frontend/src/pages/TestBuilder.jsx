import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { questionsAPI, topicsAPI, subjectsAPI, testGenerateAPI, getUploadUrl } from '../services/api';
import { difficultyColor } from '../utils/helpers';
import Spinner from '../components/Spinner';
import {
  ArrowLeft, Search, Plus, Minus, CheckCircle2, Sparkles, Eye,
  ChevronDown, ChevronUp, Trash2, Shuffle, GripVertical,
} from 'lucide-react';
import toast from 'react-hot-toast';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const KEY_STAGES = ['KS1', 'KS2', 'KS3', 'KS4'];

export default function TestBuilder() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('pick'); // 'pick' or 'auto'

  // Shared state
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [testName, setTestName] = useState('');
  const [testDate, setTestDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Pick mode state
  const [questions, setQuestions] = useState([]);
  const [loadingQ, setLoadingQ] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [filters, setFilters] = useState({ difficulty: '', key_stage: '', strand: '', area: '', skill_type: '', search: '' });
  const [basket, setBasket] = useState([]); // array of question objects
  const [expandedQ, setExpandedQ] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Auto mode state
  const [autoTopics, setAutoTopics] = useState([]); // selected topic IDs
  const [autoCount, setAutoCount] = useState(20);
  const [collapsedStrands, setCollapsedStrands] = useState(new Set());
  const [showCustomCount, setShowCustomCount] = useState(false);
  const [useDifficultyMix, setUseDifficultyMix] = useState(false);
  const [difficultyMix, setDifficultyMix] = useState({ easy: 5, medium: 10, hard: 5 });
  const [autoKeyStage, setAutoKeyStage] = useState('');
  const [autoStrand, setAutoStrand] = useState('');
  const [autoArea, setAutoArea] = useState('');
  const [autoDifficulty, setAutoDifficulty] = useState('');
  const [autoSkillType, setAutoSkillType] = useState('');

  useEffect(() => {
    subjectsAPI.list().then(r => setSubjects(r.data));
  }, []);

  useEffect(() => {
    if (selectedSubject) {
      topicsAPI.list(selectedSubject, {
        key_stage: (mode === 'pick' ? filters.key_stage : autoKeyStage) || undefined,
        strand: (mode === 'pick' ? (filters.area || filters.strand) : undefined) || undefined,
      }).then(r => {
        setTopics(r.data);
        // Auto mode: pre-select all topics, start strands collapsed
        if (mode === 'auto') {
          setAutoTopics(r.data.map(t => t.id));
          const strandNames = [...new Set(r.data.map(t => t.strand).filter(Boolean))];
          if (r.data.some(t => !t.strand)) strandNames.push('_other');
          setCollapsedStrands(new Set(strandNames));
        }
      });
      setSelectedTopic(null);
    } else {
      setTopics([]);
      setAutoTopics([]);
    }
  }, [selectedSubject, filters.key_stage, filters.strand, filters.area, autoKeyStage]);

  // Detect category:sub format and derive strand options
  const allStrands = [...new Set(topics.map(t => t.strand).filter(Boolean))].sort();
  const hasCategories = allStrands.some(s => s.includes(':'));
  const categories = hasCategories
    ? [...new Set(allStrands.map(s => s.split(':')[0].trim()))].sort()
    : [];
  const areas = hasCategories && filters.strand
    ? [...new Set(allStrands.filter(s => s.startsWith(filters.strand + ':')).map(s => s.split(':').slice(1).join(':').trim()))].sort()
    : [];
  const strands = hasCategories ? categories : allStrands;

  useEffect(() => {
    if (mode === 'pick') fetchQuestions();
  }, [selectedSubject, selectedTopic, filters.difficulty, filters.key_stage, filters.strand, filters.area, filters.skill_type]);

  const fetchQuestions = async () => {
    if (!selectedSubject) { setQuestions([]); return; }
    setLoadingQ(true);
    const params = { subject_id: selectedSubject, limit: 200 };
    if (selectedTopic) params.topic_id = selectedTopic;
    if (filters.difficulty) params.difficulty = filters.difficulty;
    if (filters.key_stage) params.key_stage = filters.key_stage;
    if (filters.area) params.strand = filters.area;
    else if (filters.strand) params.strand = filters.strand;
    if (filters.skill_type) params.skill_type = filters.skill_type;
    if (filters.search) params.search = filters.search;
    try {
      const r = await questionsAPI.list(params);
      setQuestions(r.data);
    } catch { /* ignore */ }
    setLoadingQ(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchQuestions();
  };

  // Basket operations
  const isInBasket = (qId) => basket.some(q => q.id === qId);

  const addToBasket = (q) => {
    if (!isInBasket(q.id)) setBasket([...basket, q]);
  };

  const removeFromBasket = (qId) => {
    setBasket(basket.filter(q => q.id !== qId));
  };

  const moveInBasket = (idx, dir) => {
    const newBasket = [...basket];
    const target = idx + dir;
    if (target < 0 || target >= newBasket.length) return;
    [newBasket[idx], newBasket[target]] = [newBasket[target], newBasket[idx]];
    setBasket(newBasket);
  };

  const clearBasket = () => {
    if (basket.length > 0 && window.confirm('Clear all selected questions?')) setBasket([]);
  };

  // Create test
  const handleCreateTest = async () => {
    if (!testName.trim()) { toast.error('Enter a test name'); return; }
    if (!selectedSubject) { toast.error('Select a subject'); return; }

    setCreating(true);
    try {
      if (mode === 'pick') {
        if (basket.length === 0) { toast.error('Select at least one question'); setCreating(false); return; }
        const res = await testGenerateAPI.generate({
          name: testName,
          subject_id: selectedSubject,
          test_date: testDate || undefined,
          sections: [{
            section_name: 'A',
            question_ids: basket.map(q => q.id),
          }],
        });
        toast.success(`Test "${testName}" created with ${basket.length} questions!`);
        navigate(`/tests/${res.data.id}`);
      } else {
        if (autoTopics.length === 0) { toast.error('Select at least one topic'); setCreating(false); return; }
        const section = {
          section_name: 'A',
          topic_ids: autoTopics,
          count: autoCount,
        };
        if (useDifficultyMix) {
          section.difficulty_mix = difficultyMix;
        }
        const res = await testGenerateAPI.autoGenerate({
          name: testName,
          subject_id: selectedSubject,
          test_date: testDate || undefined,
          sections: [section],
        });
        toast.success(`Test "${testName}" auto-generated!`);
        navigate(`/tests/${res.data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create test');
    }
    setCreating(false);
  };

  const totalMixCount = Object.values(difficultyMix).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/tests')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Test Builder</h1>
          <p className="text-sm text-gray-500">Build a test from the question bank</p>
        </div>
      </div>

      {/* Test config bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Test Name *</label>
            <input
              type="text"
              value={testName}
              onChange={e => setTestName(e.target.value)}
              className="w-full rounded-lg border-gray-300 text-sm"
              placeholder="e.g. Year 8 Maths End of Topic"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subject *</label>
            <select
              value={selectedSubject || ''}
              onChange={e => setSelectedSubject(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border-gray-300 text-sm"
            >
              <option value="">Select Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Test Date</label>
            <input
              type="date"
              value={testDate}
              onChange={e => setTestDate(e.target.value)}
              className="w-full rounded-lg border-gray-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Build Mode</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setMode('pick')}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === 'pick' ? 'bg-white shadow text-brand-600' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Pick Questions
              </button>
              <button
                onClick={() => setMode('auto')}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                  mode === 'auto' ? 'bg-white shadow text-brand-600' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Auto
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PICK MODE */}
      {mode === 'pick' && (
        <>
          {/* Preview Modal */}
          {showPreview && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Test Preview</h2>
                    <p className="text-sm text-gray-500">{testName || 'Untitled'} — {basket.length} questions</p>
                  </div>
                  <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {basket.map((q, idx) => (
                    <div key={q.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-sm font-bold text-gray-400 mt-0.5">{idx + 1}.</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 mb-2">{q.question_text}</p>
                          {q.image_url && (
                            <img src={getUploadUrl(q.image_url)} alt="" className="max-h-32 rounded border border-gray-200 object-contain mb-2" />
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {['A', 'B', 'C', 'D', 'E'].map(letter => {
                              const text = q[`option_${letter.toLowerCase()}`];
                              if (!text) return null;
                              const isCorrect = q.correct_answer === letter;
                              return (
                                <div
                                  key={letter}
                                  className={`px-3 py-1.5 rounded text-sm ${
                                    isCorrect
                                      ? 'bg-green-50 text-green-800 font-medium border border-green-200'
                                      : 'bg-gray-50 text-gray-700 border border-gray-100'
                                  }`}
                                >
                                  <span className="font-medium">{letter})</span> {text}
                                  {isCorrect && <span className="ml-1">✓</span>}
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${difficultyColor(q.difficulty)}`}>{q.difficulty}</span>
                            {q.topic_name && <span className="text-xs text-gray-400">{q.topic_name}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-500">{basket.length} questions selected</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowPreview(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                      Back to editing
                    </button>
                    <button
                      onClick={() => { setShowPreview(false); handleCreateTest(); }}
                      disabled={creating || !testName.trim()}
                      className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
                    >
                      {creating ? 'Creating...' : 'Create Test'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT: Question browser (2/3 width) */}
            <div className="lg:col-span-2 space-y-3">
              {/* Filters */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  <select
                    value={filters.key_stage}
                    onChange={e => setFilters(f => ({ ...f, key_stage: e.target.value, strand: '', area: '' }))}
                    className="rounded-lg border-gray-300 text-xs"
                  >
                    <option value="">All Key Stages</option>
                    {KEY_STAGES.map(ks => <option key={ks} value={ks}>{ks}</option>)}
                  </select>
                  <select
                    value={filters.strand}
                    onChange={e => setFilters(f => ({ ...f, strand: e.target.value, area: '' }))}
                    className="rounded-lg border-gray-300 text-xs"
                    disabled={!selectedSubject}
                  >
                    <option value="">{hasCategories ? 'All Categories' : 'All Strands'}</option>
                    {strands.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {hasCategories && (
                    <select
                      value={filters.area}
                      onChange={e => setFilters(f => ({ ...f, area: e.target.value }))}
                      className="rounded-lg border-gray-300 text-xs"
                      disabled={!filters.strand}
                    >
                      <option value="">All Areas</option>
                      {areas.map(a => <option key={a} value={`${filters.strand}: ${a}`}>{a}</option>)}
                    </select>
                  )}
                  <select
                    value={selectedTopic || ''}
                    onChange={e => setSelectedTopic(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-lg border-gray-300 text-xs"
                    disabled={!selectedSubject}
                  >
                    <option value="">All Topics</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.name} ({t.question_count})</option>)}
                  </select>
                  <select
                    value={filters.difficulty}
                    onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}
                    className="rounded-lg border-gray-300 text-xs"
                  >
                    <option value="">All Difficulties</option>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                  <select
                    value={filters.skill_type}
                    onChange={e => setFilters(f => ({ ...f, skill_type: e.target.value }))}
                    className="rounded-lg border-gray-300 text-xs"
                  >
                    <option value="">All Skills</option>
                    <option value="fluency">Fluency</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="problem_solving">Problem Solving</option>
                  </select>
                </div>
                <form onSubmit={handleSearch} className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Search questions..."
                    value={filters.search}
                    onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                    className="flex-1 rounded-lg border-gray-300 text-xs min-w-0"
                  />
                  <button type="submit" className="p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                    <Search className="w-4 h-4" />
                    </button>
                  </form>
              </div>

              {/* Questions list */}
              {!selectedSubject ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-lg">Select a subject above to browse questions</p>
                </div>
              ) : loadingQ ? (
                <div className="text-center py-16 text-gray-400">
                  <Spinner className="mx-auto" />
                </div>
              ) : questions.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <p>No questions match your filters</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {questions.map(q => {
                    const inBasket = isInBasket(q.id);
                    const expanded = expandedQ === q.id;
                    return (
                      <div
                        key={q.id}
                        className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-colors ${
                          inBasket ? 'border-brand-300 bg-brand-50/30' : 'border-gray-200'
                        }`}
                      >
                        <div className="p-3 flex items-start gap-3">
                          {/* Add/Remove button */}
                          <button
                            onClick={() => inBasket ? removeFromBasket(q.id) : addToBasket(q)}
                            className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                              inBasket
                                ? 'bg-brand-500 text-white hover:bg-red-500'
                                : 'bg-gray-100 text-gray-400 hover:bg-brand-100 hover:text-brand-600'
                            }`}
                            title={inBasket ? 'Remove from test' : 'Add to test'}
                          >
                            {inBasket ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>

                          {/* Question content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColor(q.difficulty)}`}>
                                {q.difficulty}
                              </span>
                      {q.strand && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">{q.strand}</span>
                              )}
                              {q.skill_type && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-teal-50 text-teal-700">
                                  {q.skill_type === 'problem_solving' ? 'Problem Solving' : q.skill_type.charAt(0).toUpperCase() + q.skill_type.slice(1)}
                                </span>
                              )}
                              {q.topic_name && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">{q.topic_name}</span>
                              )}
                              {q.year_group && <span className="text-xs text-gray-400">{q.year_group}</span>}
                            </div>
                            <p className="text-sm text-gray-900 leading-snug">{q.question_text}</p>
                            {q.image_url && (
                              <img src={getUploadUrl(q.image_url)} alt="" className="mt-1 max-h-24 rounded border border-gray-200 object-contain" />
                            )}
                          </div>

                          {/* Expand toggle */}
                          <button
                            onClick={() => setExpandedQ(expanded ? null : q.id)}
                            className="text-gray-400 hover:text-gray-600 p-1"
                          >
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Expanded: show options */}
                        {expanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-gray-100 ml-11">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">
                              {['A', 'B', 'C', 'D', 'E'].map(letter => {
                                const text = q[`option_${letter.toLowerCase()}`];
                                if (!text) return null;
                                const isCorrect = q.correct_answer === letter;
                                return (
                                  <div
                                    key={letter}
                                    className={`px-2.5 py-1.5 rounded text-sm ${
                                      isCorrect
                                        ? 'bg-green-50 text-green-800 font-medium border border-green-200'
                                        : 'bg-gray-50 text-gray-600 border border-gray-100'
                                    }`}
                                  >
                                    <span className="font-medium">{letter})</span> {text}
                                    {isCorrect && <span className="ml-1">✓</span>}
                                  </div>
                                );
                              })}
                            </div>
                            {q.explanation && (
                              <p className="text-xs text-blue-700 bg-blue-50 rounded p-2">
                                <span className="font-medium">Explanation:</span> {q.explanation}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Selected questions basket (1/3 width) */}
            <div className="space-y-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">
                    Selected ({basket.length})
                  </h3>
                  {basket.length > 0 && (
                    <button onClick={clearBasket} className="text-xs text-red-500 hover:text-red-700">
                      Clear all
                    </button>
                  )}
                </div>

                {basket.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Click + on questions to add them</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto mb-4">
                      {basket.map((q, idx) => (
                        <div
                          key={q.id}
                          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group"
                        >
                          <span className="text-xs font-bold text-gray-400 w-5 text-right">{idx + 1}.</span>
                          <p className="flex-1 text-xs text-gray-700 line-clamp-2 leading-snug">{q.question_text}</p>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveInBasket(idx, -1)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Move up">
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => moveInBasket(idx, 1)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Move down">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => removeFromBasket(q.id)} className="p-0.5 text-gray-400 hover:text-red-500" title="Remove">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Difficulty breakdown */}
                    <div className="flex gap-2 mb-4 text-xs">
                      {DIFFICULTIES.map(d => {
                        const count = basket.filter(q => q.difficulty === d).length;
                        if (count === 0) return null;
                        return (
                          <span key={d} className={`px-2 py-0.5 rounded-full ${difficultyColor(d)}`}>
                            {d}: {count}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowPreview(true)}
                        className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center justify-center gap-1"
                      >
                        <Eye className="w-4 h-4" /> Preview
                      </button>
                      <button
                        onClick={handleCreateTest}
                        disabled={creating || !testName.trim() || !selectedSubject}
                        className="flex-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {creating ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>Create Test</>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* AUTO MODE */}
      {mode === 'auto' && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Auto-Generate Test</h2>
                <p className="text-sm text-gray-500">Randomly select questions by criteria</p>
              </div>
            </div>

            {!selectedSubject ? (
              <div className="text-center py-8 text-gray-400">
                <p>Select a subject in the header above to continue</p>
              </div>
            ) : (
              <>
                {/* Key Stage filter for auto */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Key Stage</label>
                  <select
                    value={autoKeyStage}
                    onChange={e => setAutoKeyStage(e.target.value)}
                    className="w-48 rounded-lg border-gray-300 text-sm"
                  >
                    <option value="">All Key Stages</option>
                    {KEY_STAGES.map(ks => <option key={ks} value={ks}>{ks}</option>)}
                  </select>
                </div>

                {/* Topics grouped by strand — collapsible */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Topics ({autoTopics.length} of {topics.length} selected)
                    </label>
                    <div className="flex gap-3">
                      <button onClick={() => { setAutoTopics(topics.map(t => t.id)); setCollapsedStrands(new Set()); }} className="text-xs text-brand-600 hover:text-brand-800 font-medium">Select all</button>
                      <button onClick={() => setAutoTopics([])} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Deselect all</button>
                      <button onClick={() => setCollapsedStrands(new Set())} className="text-xs text-gray-500 hover:text-gray-700">Expand all</button>
                      <button onClick={() => setCollapsedStrands(new Set([...strands, '_other']))} className="text-xs text-gray-500 hover:text-gray-700">Collapse all</button>
                    </div>
                  </div>
                  {strands.length > 0 ? (
                    <div className="space-y-1">
                      {strands.map(strand => {
                        const strandTopics = topics.filter(t => t.strand === strand);
                        if (strandTopics.length === 0) return null;
                        const selectedCount = strandTopics.filter(t => autoTopics.includes(t.id)).length;
                        const allSelected = selectedCount === strandTopics.length;
                        const someSelected = selectedCount > 0 && !allSelected;
                        const isCollapsed = collapsedStrands.has(strand);
                        return (
                          <div key={strand} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => setCollapsedStrands(s => {
                                const next = new Set(s);
                                if (next.has(strand)) next.delete(strand); else next.add(strand);
                                return next;
                              })}
                            >
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={el => { if (el) el.indeterminate = someSelected; }}
                                onChange={e => {
                                  e.stopPropagation();
                                  const ids = strandTopics.map(t => t.id);
                                  if (allSelected) {
                                    setAutoTopics(autoTopics.filter(id => !ids.includes(id)));
                                  } else {
                                    setAutoTopics([...new Set([...autoTopics, ...ids])]);
                                  }
                                }}
                                onClick={e => e.stopPropagation()}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="flex-1 text-sm font-semibold text-gray-700">{strand}</span>
                              <span className="text-xs text-gray-400">{selectedCount}/{strandTopics.length} topics</span>
                              {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                            </div>
                            {!isCollapsed && (
                              <div className="flex flex-wrap gap-1.5 px-3 py-2">
                                {strandTopics.map(t => {
                                  const selected = autoTopics.includes(t.id);
                                  return (
                                    <button
                                      key={t.id}
                                      onClick={() => {
                                        setAutoTopics(selected
                                          ? autoTopics.filter(id => id !== t.id)
                                          : [...autoTopics, t.id]
                                        );
                                      }}
                                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                        selected
                                          ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300'
                                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                      }`}
                                    >
                                      {t.name}
                                      <span className="ml-1 opacity-60">({t.question_count})</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Topics without a strand */}
                      {(() => {
                        const noStrand = topics.filter(t => !t.strand);
                        if (noStrand.length === 0) return null;
                        const selectedCount = noStrand.filter(t => autoTopics.includes(t.id)).length;
                        const allSelected = selectedCount === noStrand.length;
                        const someSelected = selectedCount > 0 && !allSelected;
                        const isCollapsed = collapsedStrands.has('_other');
                        return (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => setCollapsedStrands(s => {
                                const next = new Set(s);
                                if (next.has('_other')) next.delete('_other'); else next.add('_other');
                                return next;
                              })}
                            >
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={el => { if (el) el.indeterminate = someSelected; }}
                                onChange={e => {
                                  e.stopPropagation();
                                  const ids = noStrand.map(t => t.id);
                                  if (allSelected) {
                                    setAutoTopics(autoTopics.filter(id => !ids.includes(id)));
                                  } else {
                                    setAutoTopics([...new Set([...autoTopics, ...ids])]);
                                  }
                                }}
                                onClick={e => e.stopPropagation()}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="flex-1 text-sm font-semibold text-gray-700">Other</span>
                              <span className="text-xs text-gray-400">{selectedCount}/{noStrand.length} topics</span>
                              {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                            </div>
                            {!isCollapsed && (
                              <div className="flex flex-wrap gap-1.5 px-3 py-2">
                                {noStrand.map(t => {
                                  const selected = autoTopics.includes(t.id);
                                  return (
                                    <button
                                      key={t.id}
                                      onClick={() => {
                                        setAutoTopics(selected
                                          ? autoTopics.filter(id => id !== t.id)
                                          : [...autoTopics, t.id]
                                        );
                                      }}
                                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                        selected
                                          ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300'
                                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                      }`}
                                    >
                                      {t.name}
                                      <span className="ml-1 opacity-60">({t.question_count})</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {topics.map(t => {
                        const selected = autoTopics.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              setAutoTopics(selected
                                ? autoTopics.filter(id => id !== t.id)
                                : [...autoTopics, t.id]
                              );
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                              selected
                                ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {t.name}
                            <span className="ml-1 opacity-60">({t.question_count})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Number of questions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Number of Questions</label>
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 15, 20, 25, 30].map(n => (
                      <button
                        key={n}
                        onClick={() => { setAutoCount(n); setShowCustomCount(false); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          autoCount === n && !showCustomCount
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowCustomCount(!showCustomCount)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        showCustomCount
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Custom
                    </button>
                    {showCustomCount && (
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={autoCount}
                        onChange={e => setAutoCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 rounded-lg border-gray-300 text-sm"
                        autoFocus
                      />
                    )}
                  </div>
                </div>

                {/* Difficulty mix toggle */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useDifficultyMix}
                      onChange={e => setUseDifficultyMix(e.target.checked)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Custom difficulty mix</span>
                  </label>

                  {useDifficultyMix && (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {DIFFICULTIES.map(d => (
                        <div key={d}>
                          <label className="block text-xs text-gray-500 mb-1 capitalize">{d}</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={difficultyMix[d]}
                            onChange={e => setDifficultyMix(m => ({
                              ...m, [d]: Math.max(0, parseInt(e.target.value) || 0)
                            }))}
                            className="w-full rounded-lg border-gray-300 text-sm"
                          />
                        </div>
                      ))}
                      <div className="col-span-3 text-xs text-gray-500">
                        Total: {totalMixCount} questions
                        {totalMixCount !== autoCount && (
                          <span className="text-amber-600 ml-2">(mix count overrides the number above)</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Create button */}
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={handleCreateTest}
                    disabled={creating || !testName.trim() || !selectedSubject || autoTopics.length === 0}
                    className="px-6 py-2.5 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {creating ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Shuffle className="w-4 h-4" />
                    )}
                    {creating ? 'Generating...' : 'Generate Test'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
