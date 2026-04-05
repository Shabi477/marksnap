import { useState, useEffect, useRef } from 'react';
import { questionsAPI, topicsAPI, subjectsAPI, objectivesAPI, getUploadUrl } from '../services/api';
import toast from 'react-hot-toast';
import { difficultyColor } from '../utils/helpers';
import useStrandCategories from '../hooks/useStrandCategories';
import { RefreshCw, Sparkles, X, Loader2 } from 'lucide-react';

export default function QuestionBank() {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [objectives, setObjectives] = useState([]);
  const [selectedObjective, setSelectedObjective] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ difficulty: '', key_stage: '', strand: '', area: '', skill_type: '', search: '' });
  const [expandedQ, setExpandedQ] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(null);
  const fileInputRef = useRef(null);

  // Batch generate modal state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchSubject, setBatchSubject] = useState(null);
  const [batchKeyStage, setBatchKeyStage] = useState('KS3');
  const [batchTopics, setBatchTopics] = useState([]);
  const [batchTopic, setBatchTopic] = useState(null);
  const [batchObjectives, setBatchObjectives] = useState([]);
  const [batchCounts, setBatchCounts] = useState({});
  const [batchDifficulty, setBatchDifficulty] = useState('medium');
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');


  useEffect(() => {
    subjectsAPI.list().then(r => setSubjects(r.data));
  }, []);

  useEffect(() => {
    if (selectedSubject) {
      topicsAPI.list(selectedSubject, {
        key_stage: filters.key_stage || undefined,
        strand: filters.area || filters.strand || undefined,
      }).then(r => setTopics(r.data));
      setSelectedTopic(null);
      setObjectives([]);
      setSelectedObjective(null);
    } else {
      setTopics([]);
      setObjectives([]);
    }
  }, [selectedSubject, filters.key_stage, filters.strand, filters.area]);

  // Load objectives when a topic is selected
  useEffect(() => {
    if (selectedSubject && selectedTopic) {
      objectivesAPI.list(selectedSubject, selectedTopic).then(r => setObjectives(r.data)).catch(() => setObjectives([]));
    } else {
      setObjectives([]);
    }
    setSelectedObjective(null);
  }, [selectedSubject, selectedTopic]);

  // Derive strand/category/area options from topics
  const { hasCategories, strandOptions: strands, areaOptions: areas } = useStrandCategories(topics, filters.strand);

  useEffect(() => {
    fetchQuestions();
  }, [selectedSubject, selectedTopic, selectedObjective, filters.difficulty, filters.key_stage, filters.strand, filters.area, filters.skill_type]);

  const fetchQuestions = async () => {
    if (!selectedSubject) { setQuestions([]); return; }
    setLoading(true);
    try {
      const params = { subject_id: selectedSubject };
      if (selectedTopic) params.topic_id = selectedTopic;
      if (selectedObjective) params.objective_id = selectedObjective;
      if (filters.difficulty) params.difficulty = filters.difficulty;
      if (filters.key_stage) params.key_stage = filters.key_stage;
      // Send the most specific strand: area (full "Category: Sub") or category prefix
      if (filters.area) params.strand = filters.area;
      else if (filters.strand) params.strand = filters.strand;
      if (filters.skill_type) params.skill_type = filters.skill_type;
      if (filters.search) params.search = filters.search;
      const r = await questionsAPI.list(params);
      setQuestions(r.data);
    } catch (err) {
      console.error('Failed to load questions', err);
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchQuestions();
  };

  const handleImageUpload = async (questionId, file) => {
    setUploadingImage(questionId);
    try {
      await questionsAPI.uploadImage(questionId, file);
      toast.success('Image uploaded');
      fetchQuestions();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    }
    setUploadingImage(null);
  };

  const handleImageDelete = async (questionId) => {
    if (!window.confirm('Remove this image?')) return;
    try {
      await questionsAPI.deleteImage(questionId);
      toast.success('Image removed');
      fetchQuestions();
    } catch (err) {
      toast.error('Failed to remove image');
    }
  };

  // --- Batch generate helpers ---
  const openBatchModal = () => {
    setBatchSubject(selectedSubject || null);
    setBatchKeyStage(filters.key_stage || 'KS3');
    setBatchTopic(null);
    setBatchTopics([]);
    setBatchObjectives([]);
    setBatchCounts({});
    setBatchDifficulty('medium');
    setBatchProgress('');
    setShowBatchModal(true);
  };

  useEffect(() => {
    if (showBatchModal && batchSubject) {
      topicsAPI.list(batchSubject, { key_stage: batchKeyStage || undefined })
        .then(r => { setBatchTopics(r.data); setBatchTopic(null); setBatchObjectives([]); setBatchCounts({}); })
        .catch(() => setBatchTopics([]));
    }
  }, [showBatchModal, batchSubject, batchKeyStage]);

  useEffect(() => {
    if (showBatchModal && batchSubject && batchTopic) {
      objectivesAPI.list(batchSubject, batchTopic)
        .then(r => {
          setBatchObjectives(r.data);
          // Default all counts to 0
          const counts = {};
          r.data.forEach(o => { counts[o.id] = 0; });
          setBatchCounts(counts);
        })
        .catch(() => setBatchObjectives([]));
    } else {
      setBatchObjectives([]);
      setBatchCounts({});
    }
  }, [showBatchModal, batchSubject, batchTopic]);

  const batchTotal = Object.values(batchCounts).reduce((s, c) => s + (parseInt(c) || 0), 0);

  const setAllCounts = (n) => {
    const counts = {};
    batchObjectives.forEach(o => { counts[o.id] = n; });
    setBatchCounts(counts);
  };

  const handleBatchGenerate = async () => {
    const objectives = Object.entries(batchCounts)
      .filter(([, count]) => parseInt(count) > 0)
      .map(([id, count]) => ({ objective_id: parseInt(id), count: parseInt(count) }));

    if (objectives.length === 0) {
      toast.error('Set at least 1 question for an objective');
      return;
    }

    setBatchGenerating(true);
    setBatchProgress(`Generating ${batchTotal} questions across ${objectives.length} objectives...`);

    try {
      const res = await questionsAPI.aiBatchGenerate({
        subject_id: batchSubject,
        topic_id: batchTopic,
        objectives,
        difficulty: batchDifficulty,
        key_stage: batchKeyStage,
        num_options: 4,
        source: 'system',
      });
      toast.success(`Generated ${res.data.length} questions!`);
      setShowBatchModal(false);
      fetchQuestions();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Batch generation failed');
    } finally {
      setBatchGenerating(false);
      setBatchProgress('');
    }
  };

  const answerLabel = (q, letter) => {
    const key = `option_${letter.toLowerCase()}`;
    return q[key];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={openBatchModal}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
          >
            <Sparkles className="w-4 h-4" /> AI Generate
          </button>
          <button
            onClick={() => { fetchQuestions(); toast.success('Refreshed'); }}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <span className="text-sm text-gray-500">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {/* Subject */}
          <select
            value={selectedSubject || ''}
            onChange={e => setSelectedSubject(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border-gray-300 text-sm py-2"
          >
            <option value="">Select Subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Key Stage */}
          <select
            value={filters.key_stage}
            onChange={e => setFilters(f => ({ ...f, key_stage: e.target.value, strand: '', area: '' }))}
            className="rounded-lg border-gray-300 text-sm py-2"
          >
            <option value="">All Key Stages</option>
            <option value="KS1">KS1</option>
            <option value="KS2">KS2</option>
            <option value="KS3">KS3</option>
            <option value="KS4">KS4</option>
          </select>

          {/* Strand / Category */}
          <select
            value={filters.strand}
            onChange={e => setFilters(f => ({ ...f, strand: e.target.value, area: '' }))}
            className="rounded-lg border-gray-300 text-sm py-2"
            disabled={!selectedSubject}
          >
            <option value="">{hasCategories ? 'All Categories' : 'All Strands'}</option>
            {strands.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Area — only shows when categories detected and a category is selected */}
          {hasCategories && (
            <select
              value={filters.area}
              onChange={e => setFilters(f => ({ ...f, area: e.target.value }))}
              className="rounded-lg border-gray-300 text-sm py-2"
              disabled={!filters.strand}
            >
              <option value="">All Areas</option>
              {areas.map(a => (
                <option key={a} value={`${filters.strand}: ${a}`}>{a}</option>
              ))}
            </select>
          )}

          {/* Topic */}
          <select
            value={selectedTopic || ''}
            onChange={e => setSelectedTopic(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border-gray-300 text-sm py-2"
            disabled={!selectedSubject}
          >
            <option value="">All Topics</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.question_count})</option>
            ))}
          </select>

          {/* Objective — shows when a topic is selected */}
          {selectedTopic && objectives.length > 0 && (
            <select
              value={selectedObjective || ''}
              onChange={e => setSelectedObjective(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border-gray-300 text-sm py-2"
            >
              <option value="">All Objectives</option>
              {objectives.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.question_count})</option>
              ))}
            </select>
          )}

          {/* Difficulty */}
          <select
            value={filters.difficulty}
            onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}
            className="rounded-lg border-gray-300 text-sm py-2"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Skill Type */}
          <select
            value={filters.skill_type}
            onChange={e => setFilters(f => ({ ...f, skill_type: e.target.value }))}
            className="rounded-lg border-gray-300 text-sm py-2"
          >
            <option value="">All Skill Types</option>
            <option value="fluency">Fluency</option>
            <option value="reasoning">Reasoning</option>
            <option value="problem_solving">Problem Solving</option>
          </select>
        </div>

        {/* Search — own row */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search questions..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="flex-1 rounded-lg border-gray-300 text-sm py-2"
          />
          <button type="submit" className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700">
            Search
          </button>
        </form>
      </div>

      {/* Questions */}
      {!selectedSubject ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Select a subject to browse questions</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No questions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedQ(expandedQ === q.id ? null : q.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-400">Q{q.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColor(q.difficulty)}`}>
                        {q.difficulty}
                      </span>
                      {q.strand && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">
                          {q.strand}
                        </span>
                      )}
                      {q.skill_type && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-teal-50 text-teal-700">
                          {q.skill_type === 'problem_solving' ? 'Problem Solving' : q.skill_type.charAt(0).toUpperCase() + q.skill_type.slice(1)}
                        </span>
                      )}
                      {q.topic_name && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">
                          {q.topic_name}
                        </span>
                      )}
                      {q.objective_name && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                          {q.objective_name}
                        </span>
                      )}
                      {q.year_group && (
                        <span className="text-xs text-gray-500">{q.year_group}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900">{q.question_text}</p>
                    {q.image_url && (
                      <img
                        src={getUploadUrl(q.image_url)}
                        alt="Question diagram"
                        className="mt-2 max-h-32 rounded border border-gray-200 object-contain"
                      />
                    )}
                  </div>
                  <span className="text-gray-400 ml-2">{expandedQ === q.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expandedQ === q.id && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {['A', 'B', 'C', 'D', 'E'].map(letter => {
                      const text = answerLabel(q, letter);
                      if (!text) return null;
                      const isCorrect = q.correct_answer === letter;
                      return (
                        <div
                          key={letter}
                          className={`p-2 rounded-lg text-sm border ${
                            isCorrect
                              ? 'bg-green-50 border-green-300 text-green-800 font-medium'
                              : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        >
                          <span className="font-medium mr-2">{letter})</span>
                          {text}
                          {isCorrect && <span className="ml-2">✓</span>}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                      <span className="font-medium">Explanation:</span> {q.explanation}
                    </div>
                  )}
                  {q.distractor_rationale && (() => {
                    try {
                      const rationale = typeof q.distractor_rationale === 'string'
                        ? JSON.parse(q.distractor_rationale) : q.distractor_rationale;
                      return (
                        <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800 mt-2">
                          <span className="font-medium">Distractor Rationale:</span>
                          <ul className="mt-1 space-y-0.5 list-disc list-inside">
                            {Object.entries(rationale).map(([letter, reason]) => (
                              <li key={letter}><span className="font-medium">{letter})</span> {reason}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                  {/* Image management */}
                  <div className="mt-3 space-y-2">
                    {q.image_url ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={getUploadUrl(q.image_url)}
                          alt="Question diagram"
                          className="max-h-80 rounded border border-gray-200 object-contain"
                        />
                        <button
                          onClick={() => handleImageDelete(q.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove image
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 inline-flex items-center gap-1">
                          {uploadingImage === q.id ? (
                            <span>Uploading...</span>
                          ) : (
                            <>
                              <span>+ Add image</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => {
                                  if (e.target.files[0]) handleImageUpload(q.id, e.target.files[0]);
                                  e.target.value = '';
                                }}
                              />
                            </>
                          )}
                        </label>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>Source: {q.source}</span>
                    {q.creator_name && <span>By: {q.creator_name}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI Batch Generate Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold">AI Batch Generate</h2>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Subject + Key Stage + Difficulty */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                  <select value={batchSubject || ''} onChange={e => setBatchSubject(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-lg border-gray-300 text-sm py-2">
                    <option value="">Select...</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Key Stage</label>
                  <select value={batchKeyStage} onChange={e => setBatchKeyStage(e.target.value)} className="w-full rounded-lg border-gray-300 text-sm py-2">
                    <option value="KS1">KS1</option>
                    <option value="KS2">KS2</option>
                    <option value="KS3">KS3</option>
                    <option value="KS4">KS4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Difficulty</label>
                  <select value={batchDifficulty} onChange={e => setBatchDifficulty(e.target.value)} className="w-full rounded-lg border-gray-300 text-sm py-2">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Topic */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Topic</label>
                <select value={batchTopic || ''} onChange={e => setBatchTopic(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-lg border-gray-300 text-sm py-2" disabled={!batchSubject}>
                  <option value="">Select a topic...</option>
                  {batchTopics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {/* Objectives list with per-objective counts */}
              {batchTopic && batchObjectives.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-600">Questions per Objective</label>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 5].map(n => (
                        <button key={n} onClick={() => setAllCounts(n)} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                          {n === 0 ? 'Clear' : `All ${n}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                    {batchObjectives.map(o => (
                      <div key={o.id} className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{o.name}</p>
                          <p className="text-xs text-gray-400">{o.question_count} existing</p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={batchCounts[o.id] || 0}
                          onChange={e => setBatchCounts(prev => ({ ...prev, [o.id]: parseInt(e.target.value) || 0 }))}
                          className="w-16 rounded-lg border-gray-300 text-sm py-1 text-center"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {batchTopic && batchObjectives.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  No objectives found for this topic. Add objectives in the Curriculum page first.
                </div>
              )}

              {!batchTopic && batchSubject && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  Select a topic to see its objectives.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t bg-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {batchTotal > 0 ? `${batchTotal} question${batchTotal !== 1 ? 's' : ''} to generate` : 'Set counts above'}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setShowBatchModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleBatchGenerate}
                  disabled={batchGenerating || batchTotal === 0}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {batchGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{batchProgress || 'Generating...'}</>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Generate {batchTotal} Questions</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
