import { useState, useEffect, useMemo } from 'react';
import { questionsAPI, topicsAPI, subjectsAPI, getUploadUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { difficultyColor } from '../utils/helpers';
import useStrandCategories from '../hooks/useStrandCategories';
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, Search, Sparkles, Loader2, CheckCircle2, AlertCircle, RefreshCw, Filter } from 'lucide-react';

export default function AdminPanel() {
  const { teacher } = useAuth();
  const [tab, setTab] = useState('topics');
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Topic accordion state
  const [expandedKS, setExpandedKS] = useState({});
  const [expandedStrand, setExpandedStrand] = useState({});

  // Topic form
  const [topicForm, setTopicForm] = useState({ name: '', key_stage: '', strand: '', order_index: 0 });
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);

  // Question form
  const [showForm, setShowForm] = useState(false);
  const [editingQ, setEditingQ] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(null);
  const emptyForm = {
    topic_id: '', subject_id: '', question_text: '',
    option_a: '', option_b: '', option_c: '', option_d: '', option_e: '',
    correct_answer: 'A', difficulty: 'medium', year_group: '', key_stage: 'KS3',
    explanation: '', distractor_rationale: '', skill_type: '',
    source: 'system', num_options: 4,
  };
  const [form, setForm] = useState(emptyForm);

  // Question filters
  const [qFilters, setQFilters] = useState({ key_stage: '', strand: '', area: '', topic_id: '', difficulty: '', skill_type: '', search: '' });
  const [expandedQ, setExpandedQ] = useState(null);

  // AI Batch Generation state
  const [showAIForm, setShowAIForm] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({
    topic_id: '', subject_id: '', count: 5, difficulty: 'medium',
    key_stage: 'KS3', year_group: '', num_options: 4, skill_type: '', source: 'system',
  });

  // Multi-topic batch generation
  const [multiTopicMode, setMultiTopicMode] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState(new Set());
  const [multiProgress, setMultiProgress] = useState(null); // {current, total, currentTopic}

  // Topics tab filter
  const [topicSortMode, setTopicSortMode] = useState('default'); // 'default' | 'needs_questions'
  const [topicSearch, setTopicSearch] = useState('');

  // Diagram generation
  const [diagramForm, setDiagramForm] = useState({ questionId: null, description: '', diagram_type: 'general' });
  const [generatingDiagram, setGeneratingDiagram] = useState(null); // question id

  // Advanced toggle states
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);

  const isSuperAdmin = teacher?.role === 'super_admin';

  // ── Derived: strands from topics (shared hook) ──
  const { allStrands: topicStrands, hasCategories, strandOptions, areaOptions } = useStrandCategories(topics, qFilters.strand);

  // Filter topics for questions dropdown
  const filteredTopicsForQ = useMemo(() => {
    let filtered = topics;
    if (qFilters.key_stage) filtered = filtered.filter(t => t.key_stage === qFilters.key_stage);
    if (qFilters.strand) {
      if (qFilters.area) {
        const fullStrand = `${qFilters.strand}: ${qFilters.area}`;
        filtered = filtered.filter(t => t.strand === fullStrand);
      } else if (hasCategories) {
        filtered = filtered.filter(t => t.strand && t.strand.startsWith(qFilters.strand + ':'));
      } else {
        filtered = filtered.filter(t => t.strand === qFilters.strand);
      }
    }
    return filtered;
  }, [topics, qFilters.key_stage, qFilters.strand, qFilters.area, hasCategories]);

  // ── Grouped topics for accordion ──
  const groupedTopics = useMemo(() => {
    const groups = {};
    const search = topicSearch.toLowerCase().trim();
    topics.forEach(t => {
      // Filter by search term
      if (search && !t.name.toLowerCase().includes(search) && !(t.strand || '').toLowerCase().includes(search)) return;
      const ks = t.key_stage || 'Unassigned';
      const strand = t.strand || 'General';
      if (!groups[ks]) groups[ks] = {};
      if (!groups[ks][strand]) groups[ks][strand] = [];
      groups[ks][strand].push(t);
    });
    // Sort within each strand
    Object.values(groups).forEach(strands => {
      Object.values(strands).forEach(arr => {
        if (topicSortMode === 'needs_questions') {
          arr.sort((a, b) => (a.question_count || 0) - (b.question_count || 0));
        } else {
          arr.sort((a, b) => a.order_index - b.order_index);
        }
      });
    });
    return groups;
  }, [topics, topicSortMode, topicSearch]);

  const ksOrder = ['KS1', 'KS2', 'KS3', 'KS4', 'KS5', 'Unassigned'];
  const sortedKeyStages = useMemo(() => {
    return Object.keys(groupedTopics).sort((a, b) => {
      const ia = ksOrder.indexOf(a), ib = ksOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [groupedTopics]);

  // ── Data loading ──
  useEffect(() => {
    subjectsAPI.list().then(r => setSubjects(r.data));
  }, []);

  useEffect(() => {
    if (selectedSubject) {
      loadTopics();
      // Expand all KS by default
      setExpandedKS({});
      setExpandedStrand({});
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (selectedSubject && tab === 'questions') loadQuestions();
  }, [selectedSubject, tab, qFilters.key_stage, qFilters.strand, qFilters.area, qFilters.topic_id, qFilters.difficulty, qFilters.skill_type]);

  const loadTopics = async () => {
    const r = await topicsAPI.list(selectedSubject);
    setTopics(r.data);
  };

  const loadQuestions = async () => {
    setLoading(true);
    const params = { subject_id: selectedSubject, limit: 200 };
    if (qFilters.key_stage) params.key_stage = qFilters.key_stage;
    if (qFilters.area) params.strand = qFilters.area ? `${qFilters.strand}: ${qFilters.area}` : undefined;
    else if (qFilters.strand) params.strand = qFilters.strand;
    if (qFilters.topic_id) params.topic_id = qFilters.topic_id;
    if (qFilters.difficulty) params.difficulty = qFilters.difficulty;
    if (qFilters.skill_type) params.skill_type = qFilters.skill_type;
    if (qFilters.search) params.search = qFilters.search;
    const r = await questionsAPI.list(params);
    setQuestions(r.data);
    setLoading(false);
  };

  // ── Topic CRUD ──
  const resetTopicForm = () => {
    setTopicForm({ name: '', key_stage: '', strand: '', order_index: 0 });
    setEditingTopic(null);
    setShowTopicForm(false);
  };

  const handleSaveTopic = async (e) => {
    e.preventDefault();
    try {
      if (editingTopic) {
        await topicsAPI.update(selectedSubject, editingTopic.id, topicForm);
        toast.success('Topic updated');
      } else {
        await topicsAPI.create(selectedSubject, topicForm);
        toast.success('Topic created');
      }
      resetTopicForm();
      loadTopics();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save topic');
    }
  };

  const handleEditTopic = (t) => {
    setTopicForm({ name: t.name, key_stage: t.key_stage || '', strand: t.strand || '', order_index: t.order_index });
    setEditingTopic(t);
    setShowTopicForm(true);
  };

  const handleDeleteTopic = async (topicId) => {
    if (!window.confirm('Delete this topic? Only works if it has no active questions.')) return;
    try {
      await topicsAPI.delete(selectedSubject, topicId);
      toast.success('Topic deleted');
      loadTopics();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Cannot delete topic');
    }
  };

  // ── Question CRUD ──
  const resetForm = () => {
    setForm({ ...emptyForm, subject_id: selectedSubject || '' });
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
      distractor_rationale: form.distractor_rationale || null,
      skill_type: form.skill_type || null,
      option_e: form.option_e || null,
    };
    try {
      if (editingQ) {
        await questionsAPI.update(editingQ.id, payload);
        toast.success('Question updated');
      } else {
        await questionsAPI.create(payload);
        toast.success('Question created');
      }
      resetForm();
      loadQuestions();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save question');
    }
  };

  const handleEditQuestion = (q) => {
    setForm({
      topic_id: q.topic_id, subject_id: q.subject_id, question_text: q.question_text,
      option_a: q.option_a, option_b: q.option_b, option_c: q.option_c || '', option_d: q.option_d || '',
      option_e: q.option_e || '',
      correct_answer: q.correct_answer, difficulty: q.difficulty, year_group: q.year_group || '',
      key_stage: q.key_stage || 'KS3', explanation: q.explanation || '',
      distractor_rationale: q.distractor_rationale || '',
      skill_type: q.skill_type || '',
      source: q.source, num_options: q.num_options,
    });
    setEditingQ(q);
    setShowForm(true);
    setExpandedQ(null);
  };

  const handleDeleteQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    await questionsAPI.delete(id);
    toast.success('Question deleted');
    loadQuestions();
  };

  const handleImageUpload = async (qId, file) => {
    setUploadingImage(qId);
    try {
      await questionsAPI.uploadImage(qId, file);
      toast.success('Image uploaded');
      loadQuestions();
    } catch { toast.error('Failed to upload image'); }
    finally { setUploadingImage(null); }
  };

  const handleImageDelete = async (qId) => {
    try {
      await questionsAPI.deleteImage(qId);
      toast.success('Image removed');
      loadQuestions();
    } catch { toast.error('Failed to remove image'); }
  };

  const handleGenerateDiagram = async (qId) => {
    if (!diagramForm.description.trim()) {
      toast.error('Please describe the diagram you need');
      return;
    }
    setGeneratingDiagram(qId);
    try {
      await questionsAPI.generateDiagram(qId, {
        question_id: qId,
        description: diagramForm.description,
        diagram_type: diagramForm.diagram_type,
      });
      toast.success('Diagram generated and attached!');
      setDiagramForm({ questionId: null, description: '', diagram_type: 'general' });
      loadQuestions();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Diagram generation failed');
    } finally {
      setGeneratingDiagram(null);
    }
  };

  const DIAGRAM_TYPES = [
    { value: 'geometry', label: 'Geometry (shapes, angles, triangles)' },
    { value: 'graph', label: 'Graph (coordinate axes, plots)' },
    { value: 'number_line', label: 'Number Line' },
    { value: 'bar_chart', label: 'Bar Chart' },
    { value: 'pie_chart', label: 'Pie Chart' },
    { value: 'fraction', label: 'Fraction (bars, circles, shading)' },
    { value: 'table', label: 'Table' },
    { value: 'pattern', label: 'Pattern / Sequence' },
    { value: 'venn', label: 'Venn Diagram' },
    { value: 'place_value', label: 'Place Value' },
    { value: 'area_model', label: 'Area Model' },
    { value: 'transformation', label: 'Transformation (reflect, rotate, translate)' },
    { value: 'general', label: 'General / Other' },
  ];

  const handleSearch = (e) => {
    e.preventDefault();
    loadQuestions();
  };

  // ── AI Batch Generate (single topic) ──
  const handleAIGenerate = async (e) => {
    e.preventDefault();
    if (!aiForm.topic_id || !selectedSubject) {
      toast.error('Please select a topic');
      return;
    }
    setAiGenerating(true);
    try {
      const payload = {
        ...aiForm,
        topic_id: Number(aiForm.topic_id),
        subject_id: Number(selectedSubject),
        count: Number(aiForm.count),
        num_options: Number(aiForm.num_options),
        year_group: aiForm.year_group || null,
        skill_type: aiForm.skill_type || null,
      };
      const res = await questionsAPI.aiGenerate(payload);
      toast.success(`Generated ${res.data.length} questions!`);
      setShowAIForm(false);
      loadQuestions();
      loadTopics();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'AI generation failed');
    }
    setAiGenerating(false);
  };

  // ── AI Multi-Topic Batch Generate ──
  const handleMultiTopicGenerate = async () => {
    if (selectedTopicIds.size === 0) {
      toast.error('Select at least one topic');
      return;
    }
    setAiGenerating(true);
    const topicIds = [...selectedTopicIds];
    let totalGenerated = 0;
    let failures = 0;

    for (let i = 0; i < topicIds.length; i++) {
      const tid = topicIds[i];
      const t = topics.find(x => x.id === tid);
      setMultiProgress({ current: i + 1, total: topicIds.length, currentTopic: t?.name || `Topic ${tid}` });
      try {
        const payload = {
          ...aiForm,
          topic_id: tid,
          subject_id: Number(selectedSubject),
          count: Number(aiForm.count),
          num_options: Number(aiForm.num_options),
          key_stage: t?.key_stage || aiForm.key_stage,
          year_group: aiForm.year_group || null,
          skill_type: aiForm.skill_type || null,
        };
        const res = await questionsAPI.aiGenerate(payload);
        totalGenerated += res.data.length;
      } catch {
        failures++;
      }
    }

    setMultiProgress(null);
    setAiGenerating(false);
    setSelectedTopicIds(new Set());
    setMultiTopicMode(false);
    loadTopics();
    if (tab === 'questions') loadQuestions();
    if (failures > 0) {
      toast.success(`Generated ${totalGenerated} questions across ${topicIds.length - failures} topics (${failures} failed)`);
    } else {
      toast.success(`Generated ${totalGenerated} questions across ${topicIds.length} topics!`);
    }
  };

  // ── Inline generate from Topics tab ──
  const handleInlineGenerate = (t) => {
    setAiForm(f => ({
      ...f,
      topic_id: String(t.id),
      subject_id: selectedSubject,
      key_stage: t.key_stage || 'KS3',
    }));
    setTab('questions');
    setShowAIForm(true);
    setShowForm(false);
  };

  // ── Toggle topic selection for multi-topic mode ──
  const toggleTopicSelection = (topicId) => {
    setSelectedTopicIds(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const selectAllTopicsInStrand = (strandTopics) => {
    setSelectedTopicIds(prev => {
      const next = new Set(prev);
      const allSelected = strandTopics.every(t => next.has(t.id));
      strandTopics.forEach(t => {
        if (allSelected) next.delete(t.id);
        else next.add(t.id);
      });
      return next;
    });
  };

  const toggleKS = (ks) => setExpandedKS(prev => ({ ...prev, [ks]: !prev[ks] }));
  const toggleStrand = (key) => setExpandedStrand(prev => ({ ...prev, [key]: !prev[key] }));

  // When searching topics, auto-expand all groups
  const isTopicSearching = topicSearch.trim().length > 0;
  const ksIsExpanded = (ks) => isTopicSearching || expandedKS[ks] === true;
  const strandIsExpanded = (key) => isTopicSearching || expandedStrand[key] === true;

  // ── Color-coded question count badge helper ──
  const qCountBadge = (count) => {
    if (count === 0) return 'bg-red-100 text-red-700 border-red-200';
    if (count < 5) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-green-100 text-green-700 border-green-200';
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
        <p className="text-sm text-gray-500 mt-1">Manage topics, then add questions to them</p>
      </div>

      {/* Subject selector + tabs */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={selectedSubject || ''}
          onChange={e => {
            setSelectedSubject(e.target.value ? Number(e.target.value) : null);
            setQFilters({ key_stage: '', strand: '', area: '', topic_id: '', difficulty: '', skill_type: '', search: '' });
          }}
          className="rounded-lg border-gray-300 text-sm"
        >
          <option value="">Select Subject</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'topics', label: 'Topics', hint: `${topics.length}` },
            { key: 'questions', label: 'Questions', hint: '' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium ${
                tab === t.key ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}{t.hint ? ` (${t.hint})` : ''}
            </button>
          ))}
        </div>
      </div>

      {!selectedSubject ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium">Select a subject to manage</p>
          <p className="text-sm mt-1">Start by choosing a subject, then organise topics and add questions</p>
        </div>
      ) : tab === 'topics' ? (
        /* ═══════════════════════ TOPICS TAB ═══════════════════════ */
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold">Topics</h2>
              <p className="text-xs text-gray-500">Grouped by Key Stage and Strand</p>
            </div>
            <div className="flex gap-2 items-center">
              {/* Topic search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search topics..."
                  value={topicSearch}
                  onChange={e => setTopicSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 rounded-lg border-gray-300 text-xs w-48"
                />
              </div>
              {/* Sort/filter toggle */}
              <button
                onClick={() => setTopicSortMode(m => m === 'default' ? 'needs_questions' : 'default')}
                className={`px-3 py-2 rounded-lg text-xs flex items-center gap-1 border ${
                  topicSortMode === 'needs_questions'
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
                title="Sort topics by question count (fewest first)"
              >
                <Filter className="w-3.5 h-3.5" />
                {topicSortMode === 'needs_questions' ? 'Needs Qs First' : 'Default Order'}
              </button>
              {/* Multi-topic generate toggle */}
              <button
                onClick={() => { setMultiTopicMode(m => !m); setSelectedTopicIds(new Set()); }}
                className={`px-3 py-2 rounded-lg text-xs flex items-center gap-1 ${
                  multiTopicMode
                    ? 'bg-purple-100 text-purple-700 border border-purple-300'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {multiTopicMode ? `${selectedTopicIds.size} selected` : 'Multi-Topic AI'}
              </button>
              <button
                onClick={() => { resetTopicForm(); setShowTopicForm(true); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Topic
              </button>
            </div>
          </div>

          {/* Multi-topic batch settings + generate button */}
          {multiTopicMode && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900 text-sm">Multi-Topic AI Generator</h3>
                <span className="text-xs text-purple-500">Select topics below, then configure & generate</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Qs per topic</label>
                  <select value={aiForm.count} onChange={e => setAiForm(f => ({ ...f, count: Number(e.target.value) }))} className="w-full rounded-lg border-gray-300 text-sm">
                    {[1, 2, 3, 5, 8, 10, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Difficulty</label>
                  <select value={aiForm.difficulty} onChange={e => setAiForm(f => ({ ...f, difficulty: e.target.value }))} className="w-full rounded-lg border-gray-300 text-sm">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Options</label>
                  <select value={aiForm.num_options} onChange={e => setAiForm(f => ({ ...f, num_options: Number(e.target.value) }))} className="w-full rounded-lg border-gray-300 text-sm">
                    {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Skill Type</label>
                  <select value={aiForm.skill_type} onChange={e => setAiForm(f => ({ ...f, skill_type: e.target.value }))} className="w-full rounded-lg border-gray-300 text-sm">
                    <option value="">Mixed</option>
                    <option value="fluency">Fluency</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="problem_solving">Problem Solving</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={aiGenerating || selectedTopicIds.size === 0}
                    onClick={handleMultiTopicGenerate}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {aiGenerating && multiProgress ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {multiProgress.current}/{multiProgress.total}</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> Generate ({selectedTopicIds.size})</>
                    )}
                  </button>
                </div>
              </div>
              {multiProgress && (
                <div className="space-y-1">
                  <div className="w-full bg-purple-200 rounded-full h-2">
                    <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${(multiProgress.current / multiProgress.total) * 100}%` }} />
                  </div>
                  <p className="text-xs text-purple-600">Generating for: {multiProgress.currentTopic} ({multiProgress.current}/{multiProgress.total})</p>
                </div>
              )}
            </div>
          )}

          {/* Topic Form */}
          {showTopicForm && (
            <form onSubmit={handleSaveTopic} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
              <h3 className="font-medium text-sm">{editingTopic ? 'Edit Topic' : 'New Topic'}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Topic Name</label>
                  <input
                    value={topicForm.name}
                    onChange={e => setTopicForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                    required
                    placeholder="e.g. Place Value"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Key Stage</label>
                  <select
                    value={topicForm.key_stage}
                    onChange={e => setTopicForm(f => ({ ...f, key_stage: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    <option value="">None</option>
                    {['KS1', 'KS2', 'KS3', 'KS4', 'KS5'].map(ks => <option key={ks} value={ks}>{ks}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Strand</label>
                  <input
                    value={topicForm.strand}
                    onChange={e => setTopicForm(f => ({ ...f, strand: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                    placeholder="e.g. Number"
                    list="strand-suggestions"
                  />
                  <datalist id="strand-suggestions">
                    {topicStrands.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
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
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                  {editingTopic ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={resetTopicForm} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Grouped topics accordion */}
          {topics.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-gray-500 text-center text-sm">
              No topics yet. Add some to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {sortedKeyStages.map(ks => {
                const strands = groupedTopics[ks];
                const sortedStrands = Object.keys(strands).sort();
                const ksExpanded = ksIsExpanded(ks); // default collapsed, auto-expand on search
                const totalTopics = sortedStrands.reduce((s, st) => s + strands[st].length, 0);
                const totalQuestions = sortedStrands.reduce((s, st) => s + strands[st].reduce((q, t) => q + (t.question_count || 0), 0), 0);

                return (
                  <div key={ks} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {/* KS header */}
                    <button
                      onClick={() => toggleKS(ks)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {ksExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <span className="font-semibold text-gray-900">{ks}</span>
                        <span className="text-xs text-gray-400">{totalTopics} topics &middot; {totalQuestions} questions</span>
                      </div>
                      <span className="text-xs text-gray-400">{sortedStrands.length} strand{sortedStrands.length !== 1 ? 's' : ''}</span>
                    </button>

                    {ksExpanded && (
                      <div className="border-t divide-y">
                        {sortedStrands.map(strand => {
                          const strandKey = `${ks}|${strand}`;
                          const strandExpanded = strandIsExpanded(strandKey);
                          const strandTopics = strands[strand];
                          const strandQCount = strandTopics.reduce((s, t) => s + (t.question_count || 0), 0);

                          return (
                            <div key={strandKey}>
                              {/* Strand header */}
                              <button
                                onClick={() => toggleStrand(strandKey)}
                                className="w-full flex items-center justify-between px-6 py-2 hover:bg-gray-50 text-left bg-gray-50/50"
                              >
                                <div className="flex items-center gap-2">
                                  {strandExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                  <span className="text-sm font-medium text-indigo-700">{strand}</span>
                                  <span className="text-xs text-gray-400">{strandTopics.length} topics &middot; {strandQCount} Qs</span>
                                </div>
                              </button>

                              {strandExpanded && (
                                <div className="divide-y divide-gray-100">
                                  {/* Select all in strand (multi-topic mode) */}
                                  {multiTopicMode && strandTopics.length > 1 && (
                                    <div className="px-10 py-1.5 bg-purple-50/50">
                                      <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-600">
                                        <input
                                          type="checkbox"
                                          checked={strandTopics.every(t => selectedTopicIds.has(t.id))}
                                          onChange={() => selectAllTopicsInStrand(strandTopics)}
                                          className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                                        />
                                        Select all in {strand}
                                      </label>
                                    </div>
                                  )}
                                  {strandTopics.map(t => {
                                    const qc = t.question_count || 0;
                                    return (
                                      <div key={t.id} className={`px-10 py-2 flex items-center justify-between group hover:bg-gray-50 ${multiTopicMode && selectedTopicIds.has(t.id) ? 'bg-purple-50' : ''}`}>
                                        <div className="flex items-center gap-2">
                                          {multiTopicMode && (
                                            <input
                                              type="checkbox"
                                              checked={selectedTopicIds.has(t.id)}
                                              onChange={() => toggleTopicSelection(t.id)}
                                              className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                                            />
                                          )}
                                          <span className="text-sm text-gray-900">{t.name}</span>
                                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${qCountBadge(qc)}`}>
                                            {qc} Qs
                                          </span>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={() => handleInlineGenerate(t)}
                                            className="p-1 text-purple-400 hover:text-purple-600 rounded"
                                            title="AI generate questions for this topic"
                                          >
                                            <Sparkles className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleEditTopic(t)}
                                            className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                                            title="Edit topic"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteTopic(t.id)}
                                            className="p-1 text-gray-400 hover:text-red-600 rounded"
                                            title="Delete topic"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ═══════════════════════ QUESTIONS TAB ═══════════════════════ */
        <div className="space-y-4">
          {/* Cascade filters */}
          <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
            {/* Filters — all visible */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
              <select
                value={qFilters.key_stage}
                onChange={e => setQFilters(f => ({ ...f, key_stage: e.target.value, strand: '', area: '', topic_id: '' }))}
                className="rounded-lg border-gray-300 text-xs"
              >
                <option value="">All Key Stages</option>
                {['KS1', 'KS2', 'KS3', 'KS4', 'KS5'].map(ks => <option key={ks} value={ks}>{ks}</option>)}
              </select>

              <select
                value={qFilters.strand}
                onChange={e => setQFilters(f => ({ ...f, strand: e.target.value, area: '', topic_id: '' }))}
                className="rounded-lg border-gray-300 text-xs"
              >
                <option value="">{hasCategories ? 'All Categories' : 'All Strands'}</option>
                {strandOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              {hasCategories && (
                <select
                  value={qFilters.area}
                  onChange={e => setQFilters(f => ({ ...f, area: e.target.value, topic_id: '' }))}
                  className="rounded-lg border-gray-300 text-xs"
                  disabled={!qFilters.strand}
                >
                  <option value="">All Areas</option>
                  {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              )}

              <select
                value={qFilters.topic_id}
                onChange={e => setQFilters(f => ({ ...f, topic_id: e.target.value }))}
                className="rounded-lg border-gray-300 text-xs"
              >
                <option value="">All Topics</option>
                {filteredTopicsForQ.map(t => <option key={t.id} value={t.id}>{t.name} ({t.question_count})</option>)}
              </select>

              <select
                value={qFilters.difficulty}
                onChange={e => setQFilters(f => ({ ...f, difficulty: e.target.value }))}
                className="rounded-lg border-gray-300 text-xs"
              >
                <option value="">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              <select
                value={qFilters.skill_type}
                onChange={e => setQFilters(f => ({ ...f, skill_type: e.target.value }))}
                className="rounded-lg border-gray-300 text-xs"
              >
                <option value="">All Skill Types</option>
                <option value="fluency">Fluency</option>
                <option value="reasoning">Reasoning</option>
                <option value="problem_solving">Problem Solving</option>
              </select>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                placeholder="Search questions..."
                value={qFilters.search}
                onChange={e => setQFilters(f => ({ ...f, search: e.target.value }))}
                className="flex-1 rounded-lg border-gray-300 text-xs"
              />
              <button type="submit" className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 flex items-center gap-1">
                <Search className="w-3.5 h-3.5" /> Search
              </button>
            </form>
          </div>

          {/* Add question buttons */}
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Questions ({questions.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={() => { loadQuestions(); toast.success('Refreshed'); }}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-1"
                title="Refresh questions"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button
                onClick={() => {
                  setAiForm(f => ({ ...f, subject_id: selectedSubject, topic_id: qFilters.topic_id || '', key_stage: qFilters.key_stage || 'KS3' }));
                  setShowAIForm(true);
                  setShowForm(false);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 flex items-center gap-1"
              >
                <Sparkles className="w-4 h-4" /> AI Batch Generate
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true); setShowAIForm(false); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Question
              </button>
            </div>
          </div>

          {/* AI Batch Generate Form */}
          {showAIForm && (
            <form onSubmit={handleAIGenerate} className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-sm border-2 border-purple-200 p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900">AI Batch Question Generator</h3>
                <span className="text-xs text-purple-500">Generates questions with distractors, explanations & rationale</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Topic *</label>
                  <select
                    value={aiForm.topic_id}
                    onChange={e => {
                      const tid = e.target.value;
                      const topic = topics.find(t => String(t.id) === tid);
                      setAiForm(f => ({ ...f, topic_id: tid, key_stage: topic?.key_stage || f.key_stage }));
                    }}
                    className="w-full rounded-lg border-gray-300 text-sm"
                    required
                  >
                    <option value="">Select Topic</option>
                    {(filteredTopicsForQ.length > 0 ? filteredTopicsForQ : topics).map(t =>
                      <option key={t.id} value={t.id}>{t.name} — {t.question_count || 0} Qs ({t.strand || 'General'})</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">How many?</label>
                  <select
                    value={aiForm.count}
                    onChange={e => setAiForm(f => ({ ...f, count: Number(e.target.value) }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    {[1, 2, 3, 5, 8, 10, 15, 20].map(n => <option key={n} value={n}>{n} questions</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Difficulty</label>
                  <select
                    value={aiForm.difficulty}
                    onChange={e => setAiForm(f => ({ ...f, difficulty: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Advanced options toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedAI(v => !v)}
                className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-white/70 border border-purple-300 rounded-lg hover:bg-white flex items-center gap-1.5"
              >
                {showAdvancedAI ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {showAdvancedAI ? 'Hide' : 'Show'} advanced options
              </button>

              {showAdvancedAI && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Key Stage</label>
                    <select
                      value={aiForm.key_stage}
                      onChange={e => setAiForm(f => ({ ...f, key_stage: e.target.value }))}
                      className="w-full rounded-lg border-gray-300 text-sm"
                    >
                      {['KS1', 'KS2', 'KS3', 'KS4', 'KS5'].map(ks => <option key={ks} value={ks}>{ks}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Year Group</label>
                    <select
                      value={aiForm.year_group}
                      onChange={e => setAiForm(f => ({ ...f, year_group: e.target.value }))}
                      className="w-full rounded-lg border-gray-300 text-sm"
                    >
                      <option value="">Any</option>
                      {Array.from({ length: 13 }, (_, i) => `Year ${i + 1}`).map(y =>
                        <option key={y} value={y}>{y}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Options per Q</label>
                    <select
                      value={aiForm.num_options}
                      onChange={e => setAiForm(f => ({ ...f, num_options: Number(e.target.value) }))}
                      className="w-full rounded-lg border-gray-300 text-sm"
                    >
                      {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Skill Type</label>
                    <select
                      value={aiForm.skill_type}
                      onChange={e => setAiForm(f => ({ ...f, skill_type: e.target.value }))}
                      className="w-full rounded-lg border-gray-300 text-sm"
                    >
                      <option value="">Mixed</option>
                      <option value="fluency">Fluency</option>
                      <option value="reasoning">Reasoning</option>
                      <option value="problem_solving">Problem Solving</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={aiGenerating}
                  className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {aiGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generate Questions</>
                  )}
                </button>
                <button type="button" onClick={() => setShowAIForm(false)} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Question Form */}
          {showForm && (
            <form onSubmit={handleSaveQuestion} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
              <h3 className="font-medium text-sm">{editingQ ? 'Edit Question' : 'New Question'}</h3>

              {/* Row 1: Topic, Key Stage, Difficulty, Skill Type */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Topic *</label>
                  <select
                    value={form.topic_id}
                    onChange={e => setForm(f => ({ ...f, topic_id: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                    required
                  >
                    <option value="">Select Topic</option>
                    {filteredTopicsForQ.length > 0
                      ? filteredTopicsForQ.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                      : topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                    }
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
                  <label className="block text-xs text-gray-500 mb-1">Skill Type</label>
                  <select
                    value={form.skill_type}
                    onChange={e => setForm(f => ({ ...f, skill_type: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    <option value="">None</option>
                    <option value="fluency">Fluency</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="problem_solving">Problem Solving</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Year Group, Num Options */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Year Group</label>
                  <select
                    value={form.year_group}
                    onChange={e => setForm(f => ({ ...f, year_group: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    <option value="">Select</option>
                    {Array.from({ length: 13 }, (_, i) => `Year ${i + 1}`).map(y =>
                      <option key={y} value={y}>{y}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Number of Options</label>
                  <select
                    value={form.num_options}
                    onChange={e => setForm(f => ({ ...f, num_options: Number(e.target.value) }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Question text */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Question Text *</label>
                <textarea
                  value={form.question_text}
                  onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  rows={2}
                  required
                />
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {['A', 'B', 'C', 'D', 'E'].slice(0, form.num_options).map(letter => (
                  <div key={letter}>
                    <label className="block text-xs text-gray-500 mb-1">Option {letter} {(letter === 'A' || letter === 'B') ? '*' : ''}</label>
                    <input
                      value={form[`option_${letter.toLowerCase()}`]}
                      onChange={e => setForm(f => ({ ...f, [`option_${letter.toLowerCase()}`]: e.target.value }))}
                      className="w-full rounded-lg border-gray-300 text-sm"
                      required={letter === 'A' || letter === 'B'}
                    />
                  </div>
                ))}
              </div>

              {/* Correct answer */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Correct Answer *</label>
                  <select
                    value={form.correct_answer}
                    onChange={e => setForm(f => ({ ...f, correct_answer: e.target.value }))}
                    className="w-full rounded-lg border-gray-300 text-sm"
                  >
                    {['A', 'B', 'C', 'D', 'E'].slice(0, form.num_options).map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Explanation</label>
                <textarea
                  value={form.explanation}
                  onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  rows={2}
                  placeholder="Why the correct answer is right..."
                />
              </div>

              {/* Distractor rationale */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Distractor Rationale (JSON)</label>
                <textarea
                  value={form.distractor_rationale}
                  onChange={e => setForm(f => ({ ...f, distractor_rationale: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm font-mono"
                  rows={2}
                  placeholder='{"B": "Common error: adds instead of subtracts", "C": "..."}'
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
          ) : questions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500 text-sm">
              No questions found. Add some or adjust filters.
            </div>
          ) : (
            <div className="space-y-2">
              {questions.map((q, idx) => (
                <div key={q.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedQ(expandedQ === q.id ? null : q.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-medium text-gray-400">Q{q.id}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColor(q.difficulty)}`}>
                            {q.difficulty}
                          </span>
                          {q.strand && <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">{q.strand}</span>}
                          {q.skill_type && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-teal-50 text-teal-700">
                              {q.skill_type === 'problem_solving' ? 'Problem Solving' : q.skill_type.charAt(0).toUpperCase() + q.skill_type.slice(1)}
                            </span>
                          )}
                          {q.topic_name && <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">{q.topic_name}</span>}
                          {q.key_stage && <span className="text-xs text-gray-500">{q.key_stage}</span>}
                          {q.year_group && <span className="text-xs text-gray-500">{q.year_group}</span>}
                        </div>
                        <p className="text-sm text-gray-900">{q.question_text}</p>
                        {q.image_url && (
                          <img src={getUploadUrl(q.image_url)} alt="Diagram" className="mt-2 max-h-40 rounded border border-gray-200 object-contain" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditQuestion(q); }}
                          className="p-1 text-gray-400 hover:text-indigo-600"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <span className="text-gray-400">{expandedQ === q.id ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </div>

                  {expandedQ === q.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {['A', 'B', 'C', 'D', 'E'].map(letter => {
                          const text = q[`option_${letter.toLowerCase()}`];
                          if (!text) return null;
                          const isCorrect = q.correct_answer === letter;
                          return (
                            <div key={letter} className={`p-2 rounded-lg text-sm border ${isCorrect ? 'bg-green-50 border-green-300 text-green-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                              <span className="font-medium mr-2">{letter})</span>{text}{isCorrect && <span className="ml-2">&#10003;</span>}
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
                          const rationale = typeof q.distractor_rationale === 'string' ? JSON.parse(q.distractor_rationale) : q.distractor_rationale;
                          return (
                            <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
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
                      <div className="space-y-2">
                        {q.image_url ? (
                          <div className="flex items-center gap-3">
                            <img src={getUploadUrl(q.image_url)} alt="Diagram" className="max-h-80 rounded border border-gray-200 object-contain" />
                            <button onClick={() => handleImageDelete(q.id)} className="text-xs text-red-500 hover:text-red-700">Remove image</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 inline-flex items-center gap-1">
                              {uploadingImage === q.id ? <span>Uploading...</span> : (
                                <>
                                  <span>+ Upload image</span>
                                  <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) handleImageUpload(q.id, e.target.files[0]); e.target.value = ''; }} />
                                </>
                              )}
                            </label>
                            <button
                              onClick={() => setDiagramForm(f => f.questionId === q.id ? { questionId: null, description: '', diagram_type: 'general' } : { questionId: q.id, description: q.question_text, diagram_type: 'general' })}
                              className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs hover:bg-indigo-100 inline-flex items-center gap-1"
                            >
                              <Sparkles size={12} /> AI Diagram
                            </button>
                          </div>
                        )}

                        {/* AI Diagram generation inline form */}
                        {diagramForm.questionId === q.id && (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                              <Sparkles size={14} /> Generate AI Diagram
                            </div>
                            <textarea
                              value={diagramForm.description}
                              onChange={e => setDiagramForm(f => ({ ...f, description: e.target.value }))}
                              placeholder="Describe the diagram, e.g. 'Right-angled triangle with sides 3cm, 4cm, 5cm, right angle at C marked with a square'"
                              className="w-full text-xs border border-indigo-200 rounded-md p-2 h-16 resize-none focus:ring-1 focus:ring-indigo-400"
                            />
                            <div className="flex items-center gap-2">
                              <select
                                value={diagramForm.diagram_type}
                                onChange={e => setDiagramForm(f => ({ ...f, diagram_type: e.target.value }))}
                                className="text-xs border border-indigo-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-400"
                              >
                                {DIAGRAM_TYPES.map(dt => (
                                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleGenerateDiagram(q.id)}
                                disabled={generatingDiagram === q.id}
                                className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                {generatingDiagram === q.id ? <><Loader2 size={12} className="animate-spin" /> Generating...</> : <><Sparkles size={12} /> Generate</>}
                              </button>
                              <button
                                onClick={() => setDiagramForm({ questionId: null, description: '', diagram_type: 'general' })}
                                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>Source: {q.source}</span>
                        {q.creator_name && <span>By: {q.creator_name}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
