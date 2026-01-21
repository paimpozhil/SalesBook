import { Spinner } from 'react-bootstrap';

function LoadingSpinner({ fullScreen = false, size = 'md' }) {
  if (fullScreen) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: '100vh' }}
      >
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div className="loading-container">
      <Spinner
        animation="border"
        variant="primary"
        size={size === 'sm' ? 'sm' : undefined}
      />
    </div>
  );
}

export default LoadingSpinner;
