import { useState, useEffect } from 'react';
import { Card, Table, Button, Badge, Modal, Form } from 'react-bootstrap';
import { FaPlus, FaUser, FaEdit, FaTrash, FaKey } from 'react-icons/fa';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const ROLE_COLORS = {
  TENANT_ADMIN: 'primary',
  MANAGER: 'info',
  SALES_REP: 'secondary',
};

const ROLE_LABELS = {
  TENANT_ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES_REP: 'Sales Rep',
};

const STATUS_COLORS = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  SUSPENDED: 'danger',
};

function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (user = null) => {
    setEditingUser(user);
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      });
    } else {
      reset({
        name: '',
        email: '',
        password: '',
        role: 'SALES_REP',
        status: 'ACTIVE',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    reset();
  };

  const onSubmit = async (data) => {
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, data);
        toast.success('User updated');
      } else {
        await api.post('/users', data);
        toast.success('User created');
      }
      closeModal();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  const handleResetPassword = async (id) => {
    const newPassword = window.prompt('Enter new password (min 8 characters):');
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    try {
      await api.post(`/users/${id}/reset-password`, { password: newPassword });
      toast.success('Password reset');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Reset failed');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Team Members</h1>
        <Button variant="primary" onClick={() => openModal()}>
          <FaPlus className="me-2" />
          Add User
        </Button>
      </div>

      <Card>
        {users.length === 0 ? (
          <Card.Body className="text-center py-5">
            <FaUser size={48} className="text-muted mb-3" />
            <h5>No team members</h5>
            <p className="text-muted">Add team members to help manage leads and campaigns.</p>
            <Button variant="primary" onClick={() => openModal()}>Add User</Button>
          </Card.Body>
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <Badge bg={ROLE_COLORS[user.role]}>
                      {ROLE_LABELS[user.role] || user.role}
                    </Badge>
                  </td>
                  <td>
                    <Badge bg={STATUS_COLORS[user.status]}>
                      {user.status}
                    </Badge>
                  </td>
                  <td>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <Button
                      variant="outline-warning"
                      size="sm"
                      className="me-1"
                      onClick={() => handleResetPassword(user.id)}
                      title="Reset Password"
                    >
                      <FaKey />
                    </Button>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="me-1"
                      onClick={() => openModal(user)}
                    >
                      <FaEdit />
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDelete(user.id)}
                    >
                      <FaTrash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal show={showModal} onHide={closeModal}>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <Modal.Header closeButton>
            <Modal.Title>{editingUser ? 'Edit User' : 'Add User'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control
                type="text"
                {...register('name', { required: 'Name is required' })}
                isInvalid={!!errors.name}
              />
              <Form.Control.Feedback type="invalid">
                {errors.name?.message}
              </Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                {...register('email', { required: 'Email is required' })}
                isInvalid={!!errors.email}
                disabled={!!editingUser}
              />
              <Form.Control.Feedback type="invalid">
                {errors.email?.message}
              </Form.Control.Feedback>
            </Form.Group>

            {!editingUser && (
              <Form.Group className="mb-3">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  })}
                  isInvalid={!!errors.password}
                />
                <Form.Control.Feedback type="invalid">
                  {errors.password?.message}
                </Form.Control.Feedback>
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select {...register('role')}>
                <option value="SALES_REP">Sales Rep</option>
                <option value="MANAGER">Manager</option>
                <option value="TENANT_ADMIN">Admin</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Status</Form.Label>
              <Form.Select {...register('status')}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingUser ? 'Update' : 'Create'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default UserList;
