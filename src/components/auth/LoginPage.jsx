import React from 'react';
import SailboatIcon from '../common/SailboatIcon';
import UndulatingGrid from '../common/UndulatingGrid';

export const LoginPage = ({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  error,
  handleLogin
}) => (
  <div className="login-page">
    <div className="login-card">
      <div className="circular-logo-badge">
        <div className="perspective-plane">
          <UndulatingGrid />
        </div>
        <div className="sailboat-wrapper">
          <SailboatIcon className="sailboat-svg" />
        </div>
      </div>

      <h1 className="brand-title">BiddingFlow</h1>
      <p className="brand-tagline">AI Autonomous Procurement</p>

      <form onSubmit={handleLogin} className="login-form">
        <input
          type="email"
          placeholder="ERPNext 계정 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
          disabled={loading}
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
          disabled={loading}
          autoComplete="current-password"
        />
        {error && <div className="error-badge">{error}</div>}
        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? '인증 중...' : '로그인'}
        </button>
      </form>
    </div>
  </div>
);

export default LoginPage;
