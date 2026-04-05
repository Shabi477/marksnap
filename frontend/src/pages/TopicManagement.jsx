import { useEffect, useState } from 'react';
import { subjectsAPI, topicsAPI, objectivesAPI, questionsAPI } from '../services/api';
import {
  BookOpen, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Target, X, Save, Sparkles, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const KEY_STAGES = ['KS1', 'KS2', 'KS3', 'KS4'];

export default function TopicManagement() {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedKS, setSelectedKS] = useState('KS3');
  const [topics, setTopics] = useState([]);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [objectives, setObjectives] = useState({});
  const [loading, setLoading] = useState(false);

  // Editing state
  const [editingTopic, setEditingTopic] = useState(null);
  const [editingObj, setEditingObj] = useState(null);
  const [newTopic, setNewTopic] = useState(null);
  const [newObj, setNewObj] = useState(null);

  // Batch generate state
  const [genTopic, setGenTopic] = useState(null); // topic id currently in generate mode
  const [genCounts, setGenCounts] = useState({});  // { objective_id: count }
  const [genDifficulty, setGenDifficulty] = useState('medium');
  const [genGenerating, setGenGenerating] = useState(false);

  useEffect(() => {
    subjectsAPI.list().then((res) => {
      setSubjects(res.data);
      if (res.data.length > 0) setSelectedSubject(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedSubject) return;
    setLoading(true);
    topicsAPI
      .list(selectedSubject, { key_stage: selectedKS })
      .then((res) => {
        setTopics(res.data);
        setExpandedTopic(null);
        setObjectives({});
      })
      .finally(() => setLoading(false));
  }, [selectedSubject, selectedKS]);

  const loadObjectives = async (topicId) => {
    if (objectives[topicId]) return;
    try {
      const res = await objectivesAPI.list(selectedSubject, topicId);
      setObjectives((prev) => ({ ...prev, [topicId]: res.data }));
    } catch {
      toast.error('Failed to load objectives');
    }
  };

  const toggleTopic = (topicId) => {
    if (expandedTopic === topicId) {
      setExpandedTopic(null);
    } else {
      setExpandedTopic(topicId);
      loadObjectives(topicId);
    }
  };

  // -- Topic CRUD --
  const handleCreateTopic = async () => {
    if (!newTopic?.name?.trim()) return;
    try {
      const strand = topics.length > 0 ? topics[0].strand : '';
      await topicsAPI.create(selectedSubject, {
        name: newTopic.name.trim(),
        key_stage: selectedKS,
        strand: newTopic.strand || strand,
        order_index: topics.length + 1,
      });
      toast.success('Topic created');
      setNewTopic(null);
      const res = await topicsAPI.list(selectedSubject, { key_stage: selectedKS });
      setTopics(res.data);
    } catch {
      toast.error('Failed to create topic');
    }
  };

  const handleUpdateTopic = async (topic) => {
    if (!editingTopic?.name?.trim()) return;
    try {
      await topicsAPI.update(selectedSubject, topic.id, {
        name: editingTopic.name.trim(),
        key_stage: topic.key_stage,
        strand: editingTopic.strand || topic.strand,
        order_index: topic.order_index,
      });
      toast.success('Topic updated');
      setEditingTopic(null);
      const res = await topicsAPI.list(selectedSubject, { key_stage: selectedKS });
      setTopics(res.data);
    } catch {
      toast.error('Failed to update topic');
    }
  };

  const handleDeleteTopic = async (topic) => {
    if (topic.question_count > 0) {
      toast.error(`Cannot delete — has ${topic.question_count} questions`);
      return;
    }
    try {
      await topicsAPI.delete(selectedSubject, topic.id);
      toast.success('Topic deleted');
      setTopics((prev) => prev.filter((t) => t.id !== topic.id));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete topic');
    }
  };

  // -- Objective CRUD --
  const handleCreateObjective = async (topicId) => {
    if (!newObj?.name?.trim()) return;
    try {
      await objectivesAPI.create(selectedSubject, topicId, {
        name: newObj.name.trim(),
        description: newObj.description || null,
        order_index: (objectives[topicId]?.length || 0) + 1,
      });
      toast.success('Objective created');
      setNewObj(null);
      const res = await objectivesAPI.list(selectedSubject, topicId);
      setObjectives((prev) => ({ ...prev, [topicId]: res.data }));
      // Refresh topics to update objective_count
      const tRes = await topicsAPI.list(selectedSubject, { key_stage: selectedKS });
      setTopics(tRes.data);
    } catch {
      toast.error('Failed to create objective');
    }
  };

  const handleUpdateObjective = async (topicId, obj) => {
    if (!editingObj?.name?.trim()) return;
    try {
      await objectivesAPI.update(selectedSubject, topicId, obj.id, {
        name: editingObj.name.trim(),
        description: editingObj.description || null,
        order_index: obj.order_index,
      });
      toast.success('Objective updated');
      setEditingObj(null);
      const res = await objectivesAPI.list(selectedSubject, topicId);
      setObjectives((prev) => ({ ...prev, [topicId]: res.data }));
    } catch {
      toast.error('Failed to update objective');
    }
  };

  const handleDeleteObjective = async (topicId, obj) => {
    if (obj.question_count > 0) {
      toast.error(`Cannot delete — has ${obj.question_count} questions`);
      return;
    }
    try {
      await objectivesAPI.delete(selectedSubject, topicId, obj.id);
      toast.success('Objective deleted');
      setObjectives((prev) => ({
        ...prev,
        [topicId]: prev[topicId].filter((o) => o.id !== obj.id),
      }));
      const tRes = await topicsAPI.list(selectedSubject, { key_stage: selectedKS });
      setTopics(tRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete objective');
    }
  };

  // -- Batch generate --
  const openGenMode = (topicId) => {
    const objs = objectives[topicId] || [];
    const counts = {};
    objs.forEach(o => { counts[o.id] = 0; });
    setGenCounts(counts);
    setGenDifficulty('medium');
    setGenTopic(topicId);
  };

  const genTotal = Object.values(genCounts).reduce((s, c) => s + (parseInt(c) || 0), 0);

  const setAllGenCounts = (topicId, n) => {
    const objs = objectives[topicId] || [];
    const counts = {};
    objs.forEach(o => { counts[o.id] = n; });
    setGenCounts(counts);
  };

  const handleBatchGenerate = async (topicId) => {
    const items = Object.entries(genCounts)
      .filter(([, count]) => parseInt(count) > 0)
      .map(([id, count]) => ({ objective_id: parseInt(id), count: parseInt(count) }));

    if (items.length === 0) {
      toast.error('Set at least 1 question for an objective');
      return;
    }

    setGenGenerating(true);
    try {
      const res = await questionsAPI.aiBatchGenerate({
        subject_id: selectedSubject,
        topic_id: topicId,
        objectives: items,
        difficulty: genDifficulty,
        key_stage: selectedKS,
        num_options: 4,
        source: 'system',
      });
      toast.success(`Generated ${res.data.length} questions!`);
      setGenTopic(null);
      // Refresh objectives to update question counts
      const objRes = await objectivesAPI.list(selectedSubject, topicId);
      setObjectives(prev => ({ ...prev, [topicId]: objRes.data }));
      // Refresh topics to update question counts
      const tRes = await topicsAPI.list(selectedSubject, { key_stage: selectedKS });
      setTopics(tRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Batch generation failed');
    } finally {
      setGenGenerating(false);
    }
  };

  // Unique strands for current topics
  const strands = [...new Set(topics.map((t) => t.strand).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Curriculum &amp; Objectives</h1>
        <p className="page-subtitle">Manage topics and learning objectives for your questions</p>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-4">
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(Number(e.target.value))}
          className="input-field max-w-xs"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {KEY_STAGES.map((ks) => (
            <button
              key={ks}
              onClick={() => setSelectedKS(ks)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                selectedKS === ks
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ks}
            </button>
          ))}
        </div>

        <div className="ml-auto text-sm text-gray-500">
          {topics.length} topic{topics.length !== 1 ? 's' : ''}
          {' · '}
          {topics.reduce((s, t) => s + (t.objective_count || 0), 0)} objectives
        </div>
      </div>

      {/* Topics list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : topics.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No topics found for {selectedKS}</div>
        ) : (
          strands.map((strand) => {
            const strandTopics = topics.filter((t) => t.strand === strand);
            return (
              <div key={strand} className="mb-6">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  {strand}
                </h2>
                {strandTopics.map((topic) => {
                  const isExpanded = expandedTopic === topic.id;
                  const isEditing = editingTopic?.id === topic.id;
                  const topicObjs = objectives[topic.id] || [];

                  return (
                    <div key={topic.id} className="card mb-2 p-0 overflow-hidden">
                      {/* Topic row */}
                      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => !isEditing && toggleTopic(topic.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <BookOpen className="w-4 h-4 text-brand-500 shrink-0" />

                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingTopic.name}
                              onChange={(e) => setEditingTopic({ ...editingTopic, name: e.target.value })}
                              className="input-field flex-1"
                              autoFocus
                              onKeyDown={(e) => e.key === 'Enter' && handleUpdateTopic(topic)}
                            />
                            <button onClick={() => handleUpdateTopic(topic)} className="text-emerald-500 hover:text-emerald-700">
                              <Save className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingTopic(null)} className="text-gray-400 hover:text-gray-600">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="flex-1 text-sm font-medium text-gray-800">{topic.name}</span>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">
                            {topic.objective_count || 0} obj · {topic.question_count || 0} q
                          </span>
                          {!isEditing && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTopic({ id: topic.id, name: topic.name, strand: topic.strand }); }}
                                className="p-1 text-gray-300 hover:text-brand-500 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteTopic(topic); }}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Objectives (expanded) */}
                      {isExpanded && (
                        <div className="border-t bg-gray-50 px-4 py-3">
                          {topicObjs.length === 0 && !newObj && (
                            <p className="text-xs text-gray-400 italic mb-2">No objectives yet</p>
                          )}
                          <ul className="space-y-1.5">
                            {topicObjs.map((obj) => {
                              const isObjEditing = editingObj?.id === obj.id;
                              return (
                                <li key={obj.id} className="flex items-center gap-2 group">
                                  <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  {isObjEditing ? (
                                    <div className="flex-1 flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={editingObj.name}
                                        onChange={(e) => setEditingObj({ ...editingObj, name: e.target.value })}
                                        className="input-field text-sm flex-1"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateObjective(topic.id, obj)}
                                      />
                                      <button onClick={() => handleUpdateObjective(topic.id, obj)} className="text-emerald-500 hover:text-emerald-700">
                                        <Save className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => setEditingObj(null)} className="text-gray-400 hover:text-gray-600">
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="flex-1 text-sm text-gray-700">{obj.name}</span>
                                      <span className="text-xs text-gray-400">{obj.question_count || 0}q</span>
                                      <button
                                        onClick={() => setEditingObj({ id: obj.id, name: obj.name, description: obj.description })}
                                        className="p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-brand-500 transition-all"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteObjective(topic.id, obj)}
                                        className="p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>

                          {/* Add objective */}
                          {newObj?.topicId === topic.id ? (
                            <div className="flex items-center gap-2 mt-2">
                              <Target className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                              <input
                                type="text"
                                value={newObj.name}
                                onChange={(e) => setNewObj({ ...newObj, name: e.target.value })}
                                placeholder="New objective..."
                                className="input-field text-sm flex-1"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateObjective(topic.id)}
                              />
                              <button onClick={() => handleCreateObjective(topic.id)} className="text-emerald-500 hover:text-emerald-700">
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setNewObj(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={() => setNewObj({ topicId: topic.id, name: '', description: '' })}
                                className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-700 font-medium"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add objective
                              </button>
                              {topicObjs.length > 0 && genTopic !== topic.id && (
                                <button
                                  onClick={() => openGenMode(topic.id)}
                                  className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium ml-2"
                                >
                                  <Sparkles className="w-3.5 h-3.5" /> AI Generate
                                </button>
                              )}
                            </div>
                          )}

                          {/* AI Batch Generate Panel */}
                          {genTopic === topic.id && (
                            <div className="mt-3 border border-indigo-200 rounded-lg bg-indigo-50/50 p-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-4 h-4 text-indigo-600" />
                                  <span className="text-sm font-semibold text-indigo-900">AI Generate Questions</span>
                                </div>
                                <button onClick={() => setGenTopic(null)} className="text-gray-400 hover:text-gray-600">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Difficulty + quick set */}
                              <div className="flex items-center gap-3 flex-wrap">
                                <select
                                  value={genDifficulty}
                                  onChange={e => setGenDifficulty(e.target.value)}
                                  className="rounded-lg border-gray-300 text-xs py-1.5 px-2"
                                >
                                  <option value="easy">Easy</option>
                                  <option value="medium">Medium</option>
                                  <option value="hard">Hard</option>
                                </select>
                                <span className="text-xs text-gray-500">Set all:</span>
                                {[0, 1, 2, 3, 5].map(n => (
                                  <button
                                    key={n}
                                    onClick={() => setAllGenCounts(topic.id, n)}
                                    className="px-2 py-0.5 text-xs bg-white border border-gray-200 hover:bg-gray-100 rounded"
                                  >
                                    {n === 0 ? 'Clear' : n}
                                  </button>
                                ))}
                              </div>

                              {/* Per-objective counts */}
                              <div className="space-y-1.5">
                                {topicObjs.map(obj => (
                                  <div key={obj.id} className="flex items-center gap-2">
                                    <Target className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span className="flex-1 text-xs text-gray-700 truncate">{obj.name}</span>
                                    <span className="text-xs text-gray-400 shrink-0">{obj.question_count || 0} existing</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="20"
                                      value={genCounts[obj.id] || 0}
                                      onChange={e => setGenCounts(prev => ({ ...prev, [obj.id]: parseInt(e.target.value) || 0 }))}
                                      className="w-14 rounded border-gray-300 text-xs py-1 text-center"
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* Generate button */}
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-gray-500">
                                  {genTotal > 0 ? `${genTotal} question${genTotal !== 1 ? 's' : ''} to generate` : 'Set counts above'}
                                </span>
                                <button
                                  onClick={() => handleBatchGenerate(topic.id)}
                                  disabled={genGenerating || genTotal === 0}
                                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {genGenerating ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                                  ) : (
                                    <><Sparkles className="w-3.5 h-3.5" /> Generate {genTotal > 0 ? genTotal : ''}</>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        {/* Add topic */}
        {newTopic ? (
          <div className="card flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-gray-300" />
            <input
              type="text"
              value={newTopic.name}
              onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
              placeholder="Topic name..."
              className="input-field flex-1"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTopic()}
            />
            <select
              value={newTopic.strand || ''}
              onChange={(e) => setNewTopic({ ...newTopic, strand: e.target.value })}
              className="input-field max-w-[180px]"
            >
              <option value="">Strand...</option>
              {strands.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button onClick={handleCreateTopic} className="text-emerald-500 hover:text-emerald-700">
              <Save className="w-4 h-4" />
            </button>
            <button onClick={() => setNewTopic(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setNewTopic({ name: '', strand: '' })}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-brand-500 hover:border-brand-300 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Topic
          </button>
        )}
      </div>
    </div>
  );
}
