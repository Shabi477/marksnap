import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { classesAPI, testsAPI } from '../services/api';
import { Users, FileText, ScanLine, BarChart3, Plus, ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const { teacher } = useAuth();
  const [classes, setClasses] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([classesAPI.list(), testsAPI.list()])
      .then(([classRes, testRes]) => {
        setClasses(classRes.data);
        setTests(testRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="page-title">Welcome back, {teacher?.name?.split(' ')[0]}!</h1>
        <p className="page-subtitle">
          {teacher?.role === 'hod'
            ? `Managing ${teacher?.school_name || 'your school'}`
            : teacher?.school_name
              ? `${teacher?.school_name}`
              : "Here's what's happening with your tests."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Classes" value={classes.length} color="brand" />
        <StatCard icon={Users} label="Students" value={totalStudents} color="emerald" />
        <StatCard icon={FileText} label="Tests" value={tests.length} color="amber" />
        <StatCard icon={ScanLine} label="Scans" value="—" color="teal" />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/classes" className="card flex items-center gap-4 group cursor-pointer">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center group-hover:bg-brand-200 transition-colors">
              <Plus className="w-6 h-6 text-brand-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Add a Class</p>
              <p className="text-sm text-gray-500">Set up your students</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition-colors" />
          </Link>

          <Link to="/tests" className="card flex items-center gap-4 group cursor-pointer">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-200 transition-colors">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Create a Test</p>
              <p className="text-sm text-gray-500">Design answer sheets</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-amber-500 transition-colors" />
          </Link>

          <div className="card flex items-center gap-4 opacity-80">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <ScanLine className="w-6 h-6 text-teal-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Scan Answers</p>
              <p className="text-sm text-gray-500">Select a test first</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent tests */}
      {tests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Tests</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tests.slice(0, 6).map((test) => (
              <Link key={test.id} to={`/tests/${test.id}`} className="card group cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                      {test.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {test.sections?.length || 0} section(s) •{' '}
                      {test.sections?.reduce((sum, s) => sum + s.num_questions, 0) || 0} questions
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors mt-1" />
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  Created {new Date(test.created_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    brand: 'bg-brand-100 text-brand-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    teal: 'bg-teal-100 text-teal-600',
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
