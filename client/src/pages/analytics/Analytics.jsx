import { useState, useEffect } from 'react';
import { Card, Row, Col, Table, Form } from 'react-bootstrap';
import { FaChartLine, FaEnvelope, FaUsers, FaBullseye } from 'react-icons/fa';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

function Analytics() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');
  const [channelStats, setChannelStats] = useState([]);
  const [campaignStats, setCampaignStats] = useState([]);
  const [summary, setSummary] = useState({
    totalAttempts: 0,
    totalDelivered: 0,
    totalReplies: 0,
    avgResponseRate: 0,
  });

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [channelRes, campaignRes] = await Promise.all([
        api.get(`/analytics/channels?days=${dateRange}`),
        api.get(`/analytics/campaigns?days=${dateRange}`),
      ]);

      setChannelStats(channelRes.data.data || []);
      setCampaignStats(campaignRes.data.data || []);

      // Calculate summary
      const channels = channelRes.data.data || [];
      const totalAttempts = channels.reduce((sum, c) => sum + (c.total || 0), 0);
      const totalDelivered = channels.reduce((sum, c) => sum + (c.delivered || 0), 0);
      const totalReplies = channels.reduce((sum, c) => sum + (c.replied || 0), 0);

      setSummary({
        totalAttempts,
        totalDelivered,
        totalReplies,
        avgResponseRate: totalDelivered > 0 ? ((totalReplies / totalDelivered) * 100).toFixed(1) : 0,
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
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
        <h1>Analytics</h1>
        <Form.Select
          style={{ width: '200px' }}
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Form.Select>
      </div>

      {/* Summary Cards */}
      <Row className="mb-4">
        <Col md={3}>
          <Card className="h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <p className="text-muted mb-1">Total Attempts</p>
                  <h3 className="mb-0">{summary.totalAttempts.toLocaleString()}</h3>
                </div>
                <div className="stat-icon bg-primary bg-opacity-10 text-primary">
                  <FaEnvelope />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <p className="text-muted mb-1">Delivered</p>
                  <h3 className="mb-0">{summary.totalDelivered.toLocaleString()}</h3>
                </div>
                <div className="stat-icon bg-success bg-opacity-10 text-success">
                  <FaBullseye />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <p className="text-muted mb-1">Replies</p>
                  <h3 className="mb-0">{summary.totalReplies.toLocaleString()}</h3>
                </div>
                <div className="stat-icon bg-info bg-opacity-10 text-info">
                  <FaUsers />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <p className="text-muted mb-1">Response Rate</p>
                  <h3 className="mb-0">{summary.avgResponseRate}%</h3>
                </div>
                <div className="stat-icon bg-warning bg-opacity-10 text-warning">
                  <FaChartLine />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        {/* Channel Performance */}
        <Col lg={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Channel Performance</h5>
            </Card.Header>
            <Card.Body>
              {channelStats.length === 0 ? (
                <p className="text-muted text-center py-4">No channel data available</p>
              ) : (
                <Table responsive hover>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Sent</th>
                      <th>Delivered</th>
                      <th>Replies</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelStats.map((channel, idx) => (
                      <tr key={idx}>
                        <td>{channel.channelType}</td>
                        <td>{channel.total || 0}</td>
                        <td>{channel.delivered || 0}</td>
                        <td>{channel.replied || 0}</td>
                        <td>
                          {channel.delivered > 0
                            ? ((channel.replied / channel.delivered) * 100).toFixed(1)
                            : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Campaign Performance */}
        <Col lg={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Campaign Performance</h5>
            </Card.Header>
            <Card.Body>
              {campaignStats.length === 0 ? (
                <p className="text-muted text-center py-4">No campaign data available</p>
              ) : (
                <Table responsive hover>
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Recipients</th>
                      <th>Contacted</th>
                      <th>Replies</th>
                      <th>Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignStats.map((campaign) => (
                      <tr key={campaign.id}>
                        <td>{campaign.name}</td>
                        <td>{campaign._count?.recipients || 0}</td>
                        <td>{campaign.contacted || 0}</td>
                        <td>{campaign.replied || 0}</td>
                        <td>{campaign.converted || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Analytics;
