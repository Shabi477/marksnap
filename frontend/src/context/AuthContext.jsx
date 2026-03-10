import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('marksnap_token');
    if (token) {
      authAPI.getMe()
        .then((res) => setTeacher(res.data))
        .catch(() => localStorage.removeItem('marksnap_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    localStorage.setItem('marksnap_token', res.data.access_token);
    const me = await authAPI.getMe();
    setTeacher(me.data);
  };

  const register = async (name, email, password, inviteCode) => {
    await authAPI.register({ name, email, password, invite_code: inviteCode || undefined });
    await login(email, password);
  };

  const registerSchool = async (schoolName, name, email, password) => {
    await authAPI.registerSchool({ school_name: schoolName, name, email, password });
    await login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('marksnap_token');
    setTeacher(null);
  };

  return (
    <AuthContext.Provider value={{ teacher, loading, login, register, registerSchool, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
