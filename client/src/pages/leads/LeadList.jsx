import { useState, useEffect } from 'react';
import { Card, Table, Button, Form, Row, Col, Badge, Pagination } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FaPlus, FaSearch, FaEye, FaFilter, FaTrash, FaUsers } from 'react-icons/fa';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_COLORS = {
  NEW: 'primary',
  CONTACTED: 'warning',
  QUALIFIED: 'success',
  NEGOTIATION: 'info',
  CONVERTED: 'success',
  LOST: 'danger',
};

function LeadList() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    includeDeleted: searchParams.get('includeDeleted') || '',
  });

  useEffect(() => {
    fetchLeads();
  }, [searchParams]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', searchParams.get('page') || 1);
      params.append('limit', 20);
      if (searchParams.get('search')) params.append('search', searchParams.get('search'));
      if (searchParams.get('status')) params.append('status', searchParams.get('status'));
      if (searchParams.get('includeDeleted')) params.append('includeDeleted', searchParams.get('includeDeleted'));

      const response = await api.get(`/leads?${params.toString()}`);
      setLeads(response.data.data);
      setPagination(response.data.meta.pagination);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.includeDeleted) params.set('includeDeleted', filters.includeDeleted);
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageChange = (page) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    setSearchParams(params);
  };

  const renderPagination = () => {
    const { page, totalPages } = pagination;
    if (totalPages <= 1) return null;

    const items = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    items.push(
      <Pagination.First key="first" onClick={() => handlePageChange(1)} disabled={page === 1} />,
      <Pagination.Prev key="prev" onClick={() => handlePageChange(page - 1)} disabled={page === 1} />
    );

    for (let i = start; i <= end; i++) {
      items.push(
        <Pagination.Item key={i} active={i === page} onClick={() => handlePageChange(i)}>
          {i}
        </Pagination.Item>
      );
    }

    items.push(
      <Pagination.Next key="next" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} />,
      <Pagination.Last key="last" onClick={() => handlePageChange(totalPages)} disabled={page === totalPages} />
    );

    return <Pagination className="mb-0">{items}</Pagination>;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Leads</h1>
        <Button as={Link} to="/leads/new" variant="primary">
          <FaPlus className="me-2" />
          Add Lead
        </Button>
      </div>

      <Card className="mb-4">
        <Card.Body>
          <Form onSubmit={handleSearch}>
            <Row className="g-3">
              <Col md={5}>
                <div className="input-group">
                  <span className="input-group-text">
                    <FaSearch />
                  </span>
                  <Form.Control
                    type="text"
                    placeholder="Search by company, website, or email..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  />
                </div>
              </Col>
              <Col md={3}>
                <Form.Select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <option value="">All Statuses</option>
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="NEGOTIATION">Negotiation</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="LOST">Lost</option>
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Select
                  value={filters.includeDeleted}
                  onChange={(e) => setFilters({ ...filters, includeDeleted: e.target.value })}
                >
                  <option value="">Active Only</option>
                  <option value="true">All (incl. deleted)</option>
                  <option value="only">Deleted Only</option>
                </Form.Select>
              </Col>
              <Col md={2}>
                <Button type="submit" variant="outline-primary" className="w-100">
                  <FaFilter className="me-2" />
                  Filter
                </Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      <Card>
        {loading ? (
          <LoadingSpinner />
        ) : leads.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaUsers size={48} className="text-muted mb-3" />
            <h5>No leads found</h5>
            <p className="text-muted">Try adjusting your filters or add a new lead.</p>
            <Button as={Link} to="/leads/new" variant="primary">
              Add Your First Lead
            </Button>
          </Card.Body>
        ) : (
          <>
            <Table responsive hover className="mb-0">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Industry</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`cursor-pointer ${lead.isDeleted ? 'table-secondary text-muted' : ''}`}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <td>
                      <strong>{lead.companyName}</strong>
                      {lead.isDeleted && (
                        <Badge bg="danger" className="ms-2" title="Deleted">
                          <FaTrash size={10} />
                        </Badge>
                      )}
                      {lead.website && (
                        <div className="small text-muted">{lead.website}</div>
                      )}
                    </td>
                    <td>
                      {lead.contacts?.[0] ? (
                        <>
                          <div>{lead.contacts[0].name || '-'}</div>
                          <div className="small text-muted">
                            {lead.contacts[0].email}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted">No contacts</span>
                      )}
                      {lead._count?.contacts > 1 && (
                        <Badge bg="secondary" className="ms-1">
                          +{lead._count.contacts - 1}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {lead.industries?.length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {lead.industries.slice(0, 2).map((li) => (
                            <Badge key={li.industry.id} bg="info" className="small">
                              {li.industry.name}
                            </Badge>
                          ))}
                          {lead.industries.length > 2 && (
                            <Badge bg="secondary">+{lead.industries.length - 2}</Badge>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <Badge bg={STATUS_COLORS[lead.status] || 'secondary'}>
                        {lead.status}
                      </Badge>
                    </td>
                    <td>{lead.source?.name || 'Manual'}</td>
                    <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        as={Link}
                        to={`/leads/${lead.id}`}
                        variant="outline-primary"
                        size="sm"
                      >
                        <FaEye />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <Card.Footer className="d-flex justify-content-between align-items-center">
              <span className="text-muted">
                Showing {leads.length} of {pagination.total} leads
              </span>
              {renderPagination()}
            </Card.Footer>
          </>
        )}
      </Card>
    </div>
  );
}

export default LeadList;
