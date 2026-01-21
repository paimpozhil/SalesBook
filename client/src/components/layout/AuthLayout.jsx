function AuthLayout({ children }) {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>SalesBook</h1>
          <p>Lead Generation & CRM Platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthLayout;
