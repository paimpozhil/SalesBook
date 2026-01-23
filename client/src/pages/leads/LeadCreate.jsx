import { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Badge } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { FaArrowLeft, FaPlus, FaTrash, FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';

function LeadCreate() {
  const [isLoading, setIsLoading] = useState(false);
  const [industries, setIndustries] = useState([]);
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchIndustries();
  }, []);

  const fetchIndustries = async () => {
    try {
      const response = await api.get('/industries');
      setIndustries(response.data.data);
    } catch (error) {
      console.error('Failed to fetch industries:', error);
    }
  };

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      companyName: '',
      website: '',
      size: '',
      contacts: [{ name: '', email: '', phone: '', position: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contacts',
  });

  const onSubmit = async (data) => {
    setIsLoading(true);

    try {
      // Filter out empty contacts
      const contacts = data.contacts.filter(
        (c) => c.name || c.email || c.phone
      );

      const response = await api.post('/leads', {
        ...data,
        industryIds: selectedIndustries.map((ind) => ind.id),
        contacts: contacts.length > 0 ? contacts : undefined,
      });

      toast.success('Lead created successfully');
      navigate(`/leads/${response.data.data.id}`);
    } catch (error) {
      console.error('Failed to create lead:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIndustrySelect = (e) => {
    const industryId = parseInt(e.target.value);
    if (!industryId) return;

    const industry = industries.find((ind) => ind.id === industryId);
    if (industry && !selectedIndustries.find((ind) => ind.id === industryId)) {
      setSelectedIndustries([...selectedIndustries, industry]);
    }
    e.target.value = '';
  };

  const removeIndustry = (industryId) => {
    setSelectedIndustries(selectedIndustries.filter((ind) => ind.id !== industryId));
  };

  return (
    <div>
      <div className="page-header">
        <div className="d-flex align-items-center gap-3">
          <Button variant="outline-secondary" as={Link} to="/leads">
            <FaArrowLeft />
          </Button>
          <h1>Add New Lead</h1>
        </div>
      </div>

      <Form onSubmit={handleSubmit(onSubmit)}>
        <Row className="g-4">
          <Col lg={8}>
            <Card className="mb-4">
              <Card.Header>Company Information</Card.Header>
              <Card.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Company Name *</Form.Label>
                      <Form.Control
                        type="text"
                        {...register('companyName', {
                          required: 'Company name is required',
                        })}
                        isInvalid={!!errors.companyName}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.companyName?.message}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Website</Form.Label>
                      <Form.Control
                        type="url"
                        placeholder="https://example.com"
                        {...register('website')}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Industries</Form.Label>
                      <Form.Select onChange={handleIndustrySelect} defaultValue="">
                        <option value="">Select industries...</option>
                        {industries
                          .filter((ind) => !selectedIndustries.find((s) => s.id === ind.id))
                          .map((industry) => (
                            <option key={industry.id} value={industry.id}>
                              {industry.name}
                            </option>
                          ))}
                      </Form.Select>
                      {selectedIndustries.length > 0 && (
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {selectedIndustries.map((industry) => (
                            <Badge
                              key={industry.id}
                              bg="info"
                              className="d-flex align-items-center gap-1"
                            >
                              {industry.name}
                              <FaTimes
                                size={10}
                                style={{ cursor: 'pointer' }}
                                onClick={() => removeIndustry(industry.id)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Company Size</Form.Label>
                      <Form.Select {...register('size')}>
                        <option value="">Select size</option>
                        <option value="MICRO">Micro (1-10 employees)</option>
                        <option value="SMALL">Small (11-50 employees)</option>
                        <option value="MEDIUM">Medium (51-200 employees)</option>
                        <option value="LARGE">Large (201-1000 employees)</option>
                        <option value="ENTERPRISE">Enterprise (1000+ employees)</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                <span>Contacts</span>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => append({ name: '', email: '', phone: '', position: '' })}
                >
                  <FaPlus className="me-1" /> Add Contact
                </Button>
              </Card.Header>
              <Card.Body>
                {fields.map((field, index) => (
                  <div key={field.id} className="border rounded p-3 mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <strong>Contact {index + 1}</strong>
                      {fields.length > 1 && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => remove(index)}
                        >
                          <FaTrash />
                        </Button>
                      )}
                    </div>
                    <Row className="g-3">
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Name</Form.Label>
                          <Form.Control
                            type="text"
                            {...register(`contacts.${index}.name`)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Position</Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="e.g., CEO, CTO"
                            {...register(`contacts.${index}.position`)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Email</Form.Label>
                          <Form.Control
                            type="email"
                            {...register(`contacts.${index}.email`)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Phone</Form.Label>
                          <Form.Control
                            type="tel"
                            {...register(`contacts.${index}.phone`)}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </div>
                ))}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={4}>
            <Card>
              <Card.Header>Actions</Card.Header>
              <Card.Body>
                <div className="d-grid gap-2">
                  <Button type="submit" variant="primary" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Create Lead'}
                  </Button>
                  <Button
                    as={Link}
                    to="/leads"
                    variant="outline-secondary"
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}

export default LeadCreate;
