import { useState, useRef } from 'react';
import { Modal, Form, Button, Table, Alert, Badge, Spinner, Tabs, Tab } from 'react-bootstrap';
import { FaUpload, FaDownload, FaFileAlt, FaTrash } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../../services/api';

const JSON_FORMAT_EXAMPLE = `[
  {
    "name": "Company Name",
    "website": "https://example.com",
    "location": "City",
    "companyType": ["IT", "SaaS"],
    "contacts": [
      { "name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "position": "CEO" }
    ]
  }
]`;

const CSV_FORMAT_EXAMPLE = `name,website,location,companyType,contactName,contactEmail,contactPhone,contactPosition
"Company Name","https://example.com","City","IT;SaaS","John Doe","john@example.com","+1234567890","CEO"`;

function AddDataSourceModal({ show, onHide, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Importing
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Form data
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);

  // Upload result
  const [uploadResult, setUploadResult] = useState(null);
  const [selectedLeads, setSelectedLeads] = useState([]);

  const resetForm = () => {
    setStep(1);
    setName('');
    setFile(null);
    setUploadResult(null);
    setSelectedLeads([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetForm();
    onHide();
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ['application/json', 'text/csv', 'text/plain'];
      const validExtensions = ['.json', '.csv'];
      const isValidType = validTypes.includes(selectedFile.type) ||
        validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));

      if (!isValidType) {
        setError('Please select a JSON or CSV file');
        return;
      }

      // Validate file size (50MB max)
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }

      setFile(selectedFile);
      setError(null);

      // Auto-set name from filename if empty
      if (!name) {
        const baseName = selectedFile.name.replace(/\.(json|csv)$/i, '');
        setName(baseName);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    if (!name) {
      setError('Please enter a name for this data source');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/data-sources/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const result = response.data.data;
      setUploadResult(result);
      setSelectedLeads(result.leads.map((_, i) => i)); // Select all by default

      if (result.totalRecords > 0) {
        setStep(2);
        toast.success(`Parsed ${result.totalRecords} records from file`);
      } else {
        setError('No valid records found in the file');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (selectedLeads.length === 0) {
      setError('Please select at least one lead to import');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const leadsToImport = selectedLeads.map(i => uploadResult.leads[i]);

      const response = await api.post('/data-sources/file-import', {
        name,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        fileType: uploadResult.fileType,
        leads: leadsToImport,
      });

      const { imported, skipped, failed } = response.data.data;
      let message = `Imported ${imported} leads`;
      if (skipped > 0) message += `, ${skipped} duplicates skipped`;
      if (failed > 0) message += `, ${failed} failed`;
      toast.success(message);

      handleClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to import leads');
    } finally {
      setLoading(false);
    }
  };

  const toggleLead = (index) => {
    setSelectedLeads(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const toggleAll = () => {
    if (selectedLeads.length === uploadResult?.leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(uploadResult?.leads.map((_, i) => i) || []);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal show={show} onHide={handleClose} size="xl" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          {step === 1 && 'Import Data Source'}
          {step === 2 && `Preview (${uploadResult?.totalRecords || 0} records)`}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {step === 1 && (
          <>
            <Form.Group className="mb-3">
              <Form.Label>Data Source Name *</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., NASSCOM Members, Tech Companies Q1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label>Upload File (JSON or CSV) *</Form.Label>
              <div className="border rounded p-4 text-center bg-light">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,.csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {file ? (
                  <div>
                    <FaFileAlt size={32} className="text-primary mb-2" />
                    <div className="fw-bold">{file.name}</div>
                    <div className="text-muted small">{formatFileSize(file.size)}</div>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <FaTrash className="me-1" /> Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <FaUpload size={32} className="text-muted mb-2" />
                    <div>Drag and drop or click to select</div>
                    <Button
                      variant="outline-primary"
                      className="mt-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Select File
                    </Button>
                  </div>
                )}
              </div>
              <Form.Text className="text-muted">
                Maximum 10,000 records per file. Max file size: 50MB
              </Form.Text>
            </Form.Group>

            <Tabs defaultActiveKey="json" className="mb-3">
              <Tab eventKey="json" title="JSON Format">
                <Alert variant="info">
                  <strong>Expected JSON Format:</strong>
                  <pre className="mb-0 mt-2" style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                    {JSON_FORMAT_EXAMPLE}
                  </pre>
                </Alert>
              </Tab>
              <Tab eventKey="csv" title="CSV Format">
                <Alert variant="info">
                  <strong>Expected CSV Format:</strong>
                  <pre className="mb-0 mt-2" style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                    {CSV_FORMAT_EXAMPLE}
                  </pre>
                  <div className="mt-2 small">
                    Note: Use semicolons (;) to separate multiple industries in companyType
                  </div>
                </Alert>
              </Tab>
            </Tabs>
          </>
        )}

        {step === 2 && uploadResult && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <Form.Check
                  type="checkbox"
                  label={`Select All (${selectedLeads.length}/${uploadResult.totalRecords})`}
                  checked={selectedLeads.length === uploadResult.leads.length}
                  onChange={toggleAll}
                />
              </div>
              <div>
                <Badge bg="secondary" className="me-2">
                  {uploadResult.fileType}
                </Badge>
                <Button variant="outline-secondary" size="sm" onClick={() => setStep(1)}>
                  Back
                </Button>
              </div>
            </div>

            <Table striped bordered hover size="sm" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Company Name</th>
                  <th>Website</th>
                  <th>Location</th>
                  <th>Industries</th>
                  <th>Contacts</th>
                </tr>
              </thead>
              <tbody>
                {uploadResult.preview.map((lead, index) => (
                  <tr key={index} className={selectedLeads.includes(index) ? '' : 'text-muted'}>
                    <td>
                      <Form.Check
                        type="checkbox"
                        checked={selectedLeads.includes(index)}
                        onChange={() => toggleLead(index)}
                      />
                    </td>
                    <td>
                      <strong>{lead.companyName || '-'}</strong>
                    </td>
                    <td>
                      {lead.website ? (
                        <a href={lead.website} target="_blank" rel="noopener noreferrer">
                          {(() => {
                            try {
                              return new URL(lead.website).hostname;
                            } catch {
                              return lead.website.substring(0, 30);
                            }
                          })()}
                        </a>
                      ) : '-'}
                    </td>
                    <td>{lead.location || '-'}</td>
                    <td>
                      {lead.companyType && lead.companyType.length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {lead.companyType.slice(0, 3).map((type, i) => (
                            <Badge key={i} bg="info" className="small">{type}</Badge>
                          ))}
                          {lead.companyType.length > 3 && (
                            <Badge bg="secondary">+{lead.companyType.length - 3}</Badge>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td>
                      {lead.contacts && lead.contacts.length > 0 ? (
                        <span className="text-muted small">
                          {lead.contacts.length} contact{lead.contacts.length > 1 ? 's' : ''}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {uploadResult.totalRecords > 100 && (
              <Alert variant="info">
                Showing first 100 of {uploadResult.totalRecords} records. All selected records will be imported.
              </Alert>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>

        {step === 1 && (
          <Button variant="primary" onClick={handleUpload} disabled={loading || !file || !name}>
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Parsing...
              </>
            ) : (
              <>
                <FaUpload className="me-2" />
                Upload & Preview
              </>
            )}
          </Button>
        )}

        {step === 2 && (
          <Button
            variant="success"
            onClick={handleImport}
            disabled={loading || selectedLeads.length === 0}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Importing...
              </>
            ) : (
              <>
                <FaDownload className="me-2" />
                Import {selectedLeads.length} Leads
              </>
            )}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default AddDataSourceModal;
