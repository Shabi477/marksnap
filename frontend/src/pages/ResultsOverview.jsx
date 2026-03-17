import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { testsAPI, resultsAPI } from '../services/api';
import Spinner from '../components/Spinner';
import { BarChart3, ArrowRight, FileText, Camera } from 'lucide-react';

export default function ResultsOverview() {
  const [tests, setTests] = useState([]);
  const [resultCounts, setResultCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testsAPI.list()
      .then(async (res) => {
        const testList = res.data;
        setTests(testList);

        // Fetch result counts for each test
        const counts = {};
        await Promise.all(
          testList.map(async (t) => {
            try {
              const r = await resultsAPI.get(t.id);
              counts[t.id] = r.data.length;
            } catch {
              counts[t.id] = 0;
            }
          })
        );
        setResultCounts(counts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  const testsWithResults = tests.filter((t) => (resultCounts[t.id] || 0) > 0);
  const testsWithoutResults = tests.filter((t) => (resultCounts[t.id] || 0) === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Results</h1>
        <p className="page-subtitle">View scores and analytics for your tests</p>
      </div>

      {tests.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No tests yet</h3>
          <p className="text-gray-500 mt-1">Create a test and scan some answers to see results here.</p>
          <Link to="/tests" className="btn-primary mt-4 inline-block">
            Go to Tests
          </Link>
        </div>
      ) : (
        <>
          {/* Tests with results */}
          {testsWithResults.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Tests with Results
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {testsWithResults.map((test) => {
                  const count = resultCounts[test.id] || 0;
                  const totalQ = test.sections?.reduce((s, sec) => s + sec.num_questions, 0) || 0;
                  return (
                    <Link
                      key={test.id}
                      to={`/results/${test.id}`}
                      className="card group cursor-pointer hover:ring-2 hover:ring-brand-200 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                          <BarChart3 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors truncate">
                            {test.name}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {totalQ} questions • {count} scanned
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors mt-1 shrink-0" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tests without results */}
          {testsWithoutResults.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Not Yet Scanned
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {testsWithoutResults.map((test) => {
                  const totalQ = test.sections?.reduce((s, sec) => s + sec.num_questions, 0) || 0;
                  return (
                    <div key={test.id} className="card">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">{test.name}</h3>
                          <p className="text-sm text-gray-500 mt-0.5">{totalQ} questions • No results</p>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link
                          to={`/live-scan/${test.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" /> Scan
                        </Link>
                        <Link
                          to={`/tests/${test.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> Details
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
