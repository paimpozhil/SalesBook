import { useState, useEffect } from 'react';
import { Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaUsers, FaBullhorn, FaEnvelope, FaChartLine } from 'react-icons/fa';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';

function StatCard({ icon: Icon, value, label, color = 'primary' }) {
  return (
    <Card className="stat-card h-100">
      <Card.Body className="d-flex align-items-center">
        <div className="flex-grow-1">
          <div className="stat-value" style={{ color: `var(--bs-${color})` }}>
            {value}
          </div>
          <div className="stat-label">{label}</div>
        </div>
        <Icon className="stat-icon" style={{ color: `var(--bs-${color})` }} />
      </Card.Body>
    </Card>
  );
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/analytics/overview');
      setStats(response.data.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      <Row className="g-4 mb-4">
        <Col md={6} lg={3}>
          <StatCard
            icon={FaUsers}
            value={stats?.totalLeads || 0}
            label="Total Leads"
            color="primary"
          />
        </Col>
        <Col md={6} lg={3}>
          <StatCard
            icon={FaChartLine}
            value={stats?.newLeadsThisMonth || 0}
            label="New This Month"
            color="success"
          />
        </Col>
        <Col md={6} lg={3}>
          <StatCard
            icon={FaBullhorn}
            value={stats?.activeCampaigns || 0}
            label="Active Campaigns"
            color="warning"
          />
        </Col>
        <Col md={6} lg={3}>
          <StatCard
            icon={FaEnvelope}
            value={stats?.totalSentLast30Days || 0}
            label="Messages Sent (30d)"
            color="info"
          />
        </Col>
      </Row>

      <Row className="g-4">
        <Col lg={8}>
          <Card>
            <Card.Header>Lead Status Distribution</Card.Header>
            <Card.Body>
              {stats?.leadsByStatus ? (
                <div className="d-flex flex-wrap gap-3">
                  {Object.entries(stats.leadsByStatus).map(([status, count]) => (
                    <div key={status} className="text-center px-3 py-2">
                      <span className={`badge badge-status status-${status.toLowerCase()} d-block mb-1`}>
                        {status}
                      </span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted mb-0">No data available</p>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4}>
          <Card>
            <Card.Header>Quick Actions</Card.Header>
            <Card.Body>
              <div className="d-grid gap-2">
                <Link to="/leads/new" className="btn btn-primary">
                  Add New Lead
                </Link>
                <Link to="/campaigns" className="btn btn-outline-primary">
                  View Campaigns
                </Link>
                <Link to="/data-sources" className="btn btn-outline-secondary">
                  Manage Data Sources
                </Link>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Dashboard;
