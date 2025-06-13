import React, { useState, useEffect } from 'react';
import {
    listDepartments,
    listCommittees,
    listUsers,
    createDepartment,
    createCommittee,
    createUser,
    deleteDepartment,
    deleteCommittee,
    deleteUser
} from '../../config/api';
import Modal from '../modals/Modal';
import UserListModal from '../modals/UserListModal';
import DemandManagement from './DemandManagement';
import GrievanceDeadlineManagement from './GrievanceDeadlineManagement';
import { UserPlus, Trash2, Eye, Package, Clock } from 'lucide-react';

const glassTableClass = `
  w-full table-auto bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg
  border border-white border-opacity-30 rounded-2xl shadow-lg overflow-hidden
`;

const AdminDashboard = () => {
    // State hooks
    const [departments, setDepartments] = useState([]);
    const [committees, setCommittees] = useState([]);
    const [users, setUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('management'); // management or demands
    const [showDepartmentModal, setShowDepartmentModal] = useState(false);
    const [showCommitteeModal, setShowCommitteeModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showUserListModal, setShowUserListModal] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState({ id: null, type: '' });
    const [searchTerm, setSearchTerm] = useState('');

    const [newName, setNewName] = useState('');
    const [newUser, setNewUser] = useState({
        name: '', designation: '', departmentId: '', committeeId: '', eligibleForDemandCreation: false
    });
    const [error, setError] = useState('');
    const [createdCredentials, setCreatedCredentials] = useState(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        try {
            const [d, c, u] = await Promise.all([
                listDepartments(), listCommittees(), listUsers()
            ]);
            setDepartments(d);
            setCommittees(c);
            setUsers(u);
        } catch (e) {
            setError(e.error || 'Failed to load data');
        }
    };

    // --- Create / Delete handlers ---
    const handleCreate = async (type) => {
        if (!newName.trim()) { setError('Name is required'); return; }
        try {
            if (type === 'department') await createDepartment(newName);
            else await createCommittee(newName);
            setNewName('');
            setShowDepartmentModal(false);
            setShowCommitteeModal(false);
            fetchAll();
        } catch {
            setError(`Error creating ${type}`);
        }
    };

    const handleDelete = async (type, id) => {
        if (!confirm('Are you sure?')) return;
        try {
            if (type === 'department') await deleteDepartment(id);
            if (type === 'committee') await deleteCommittee(id);
            if (type === 'user') await deleteUser(id);
            fetchAll();
        } catch {
            setError(`Error deleting ${type}`);
        }
    };

    const handleCreateUser = async e => {
        e.preventDefault();
        if (!newUser.name || !newUser.designation || (!newUser.departmentId && !newUser.committeeId)) {
            setError('Name, designation & either department or committee are required');
            return;
        }
        try {
            const { credentials } = await createUser(newUser);
            setCreatedCredentials(credentials);
            setShowUserModal(false);
            setNewUser({ name: '', designation: '', departmentId: '', committeeId: '', eligibleForDemandCreation: false });
            fetchAll();
        } catch {
            setError('Error creating user');
        }
    };

    const getUsersFor = (id, type) =>
        users.filter(u => type === 'department' ? u.department_id === id : u.committee_id === id);

    // Users filtered by selected group and search term
    const filteredUsers = selectedGroup.id
        ? getUsersFor(selectedGroup.id, selectedGroup.type)
            .filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : [];

    // Get the title for the user list modal
    const getUserListTitle = () => {
        if (!selectedGroup.id) return 'View Members';
        if (selectedGroup.type === 'department') {
            const dept = departments.find(d => d.id === selectedGroup.id);
            return `Department Members - ${dept?.name || ''}`;
        } else {
            const comm = committees.find(c => c.id === selectedGroup.id);
            return `Committee Members - ${comm?.name || ''}`;
        }
    }; return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            <h1 className="text-3xl font-bold text-black">Admin Dashboard</h1>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded flex justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="font-bold">×</button>
                </div>
            )}
            {createdCredentials && (
                <div className="bg-green-100 border border-green-400 text-green-700 p-4 rounded">
                    <h3 className="font-semibold">User Created!</h3>
                    <p>Username: {createdCredentials.username}</p>
                    <p>Password: {createdCredentials.password}</p>
                    <button onClick={() => setCreatedCredentials(null)} className="mt-2 text-green-700">OK</button>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex space-x-1 bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-white border-opacity-30 rounded-lg p-1">
                <button
                    onClick={() => setActiveTab('management')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'management'
                            ? 'bg-white bg-opacity-30 text-black font-medium'
                            : 'text-gray-700 hover:bg-white hover:bg-opacity-20'
                        }`}
                >
                    <UserPlus size={20} />
                    <span>User Management</span>
                </button>
                <button
                    onClick={() => setActiveTab('demands')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'demands'
                            ? 'bg-white bg-opacity-30 text-black font-medium'
                            : 'text-gray-700 hover:bg-white hover:bg-opacity-20'
                        }`}
                >
                    <Package size={20} />
                    <span>Demand Management</span>                </button>
                <button
                    onClick={() => setActiveTab('grievances')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'grievances'
                            ? 'bg-white bg-opacity-30 text-black font-medium'
                            : 'text-gray-700 hover:bg-white hover:bg-opacity-20'
                        }`}
                >
                    <Clock size={20} />
                    <span>Grievance Settings</span>
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'management' && (
                <div className="space-y-6">
                    {/* Departments Table */}
                    <div className={glassTableClass}>
                        <div className="flex justify-between items-center p-4">
                            <h2 className="text-xl font-semibold text-black">Departments</h2>
                            <button
                                onClick={() => setShowDepartmentModal(true)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                            >+ Add</button>
                        </div>
                        <table className="min-w-full text-black">
                            <thead>
                                <tr className="border-b border-white border-opacity-30">
                                    <th className="px-4 py-2 text-left">Name</th>
                                    <th className="px-4 py-2 text-center">Members</th>
                                    <th className="px-4 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departments.length === 0 ? (
                                    <tr><td colSpan="3" className="px-4 py-3 text-center">No Departments added yet.</td></tr>
                                ) : (
                                    departments.map(d => (
                                        <tr key={d.id} className="hover:bg-white hover:bg-opacity-10">
                                            <td className="px-4 py-3">{d.name}</td>
                                            <td className="px-4 py-3 text-center">{getUsersFor(d.id, 'department').length}</td>
                                            <td className="px-4 py-3 flex items-center justify-center space-x-2">
                                                <button onClick={() => { setNewUser(u => ({ ...u, departmentId: d.id })); setShowUserModal(true); }} aria-label="Add Member" className="p-1 hover:bg-gray-200 rounded">
                                                    <UserPlus className="h-5 w-5 text-black" />
                                                </button>
                                                <button onClick={() => handleDelete('department', d.id)} aria-label="Delete Department" className="p-1 hover:bg-gray-200 rounded">
                                                    <Trash2 className="h-5 w-5 text-red-600" />
                                                </button>
                                                <button onClick={() => { setSelectedGroup({ id: d.id, type: 'department' }); setSearchTerm(''); setShowUserListModal(true); }} aria-label="View Members" className="p-1 hover:bg-gray-200 rounded">
                                                    <Eye className="h-5 w-5 text-black" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div> 
                    <div className={glassTableClass}>
                        <div className="flex justify-between items-center p-4">
                            <h2 className="text-xl font-semibold text-black">Committees</h2>
                            <button onClick={() => setShowCommitteeModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">+ Add</button>
                        </div>
                        <table className="min-w-full text-black">
                            <thead>
                                <tr className="border-b border-white border-opacity-30">
                                    <th className="px-4 py-2 text-left">Name</th>
                                    <th className="px-4 py-2 text-center">Members</th>
                                    <th className="px-4 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {committees.length === 0 ? (
                                    <tr><td colSpan="3" className="px-4 py-3 text-center">No Committees added yet.</td></tr>
                                ) : (committees.map(c => (
                                        <tr key={c.id} className="hover:bg-white hover:bg-opacity-10">
                                            <td className="px-4 py-3">{c.name}</td>
                                            <td className="px-4 py-3 text-center">{getUsersFor(c.id, 'committee').length}</td>
                                            <td className="px-4 py-3 flex items-centertainment space-x-2 justify-center">
                                                <button onClick={() => { setNewUser(u => ({ ...u, committeeId: c.id })); setShowUserModal(true); }} aria-label="Add Member" className="p-1 hover:bg-gray-200 rounded">
                                                    <UserPlus className="h-5 w-5 text-black" />
                                                </button>
                                                <button onClick={() => handleDelete('committee', c.id)} aria-label="Delete Committee" className="p-1 hover:bg-gray-200 rounded">
                                                    <Trash2 className="h-5 w-5 text-red-600" />
                                                </button>
                                                <button onClick={() => { setSelectedGroup({ id: c.id, type: 'committee' }); setSearchTerm(''); setShowUserListModal(true); }} aria-label="View Members" className="p-1 hover:bg-gray-200 rounded">
                                                    <Eye className="h-5 w-5 text-black" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}                    </tbody>                </table>
                    </div>
                </div>
            )}

            {/* Demand Management Tab */}
            {activeTab === 'demands' && (
                <DemandManagement />
            )}

            {/* Grievance Settings Tab */}
            {activeTab === 'grievances' && (
                <GrievanceDeadlineManagement />
            )}

            {/* User List Modal */}
            <UserListModal
                show={showUserListModal}
                onClose={() => setShowUserListModal(false)}
                title={getUserListTitle()}
                users={filteredUsers}
                onDelete={handleDelete}
                searchTerm={searchTerm}
                onSearchChange={(e) => setSearchTerm(e.target.value)}
            />

            {/* Department Modal */}
            <Modal show={showDepartmentModal} onClose={() => setShowDepartmentModal(false)} title="Add Department">
                <form onSubmit={(e) => { e.preventDefault(); handleCreate('department'); }}>
                    <input
                        type="text"
                        placeholder="Department Name"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        className="w-full p-2 border rounded mb-4"
                    />
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">Create</button>
                </form>
            </Modal>

            {/* Committee Modal */}
            <Modal show={showCommitteeModal} onClose={() => setShowCommitteeModal(false)} title="Add Committee">
                <form onSubmit={(e) => { e.preventDefault(); handleCreate('committee'); }}>
                    <input
                        type="text"
                        placeholder="Committee Name"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        className="w-full p-2 border rounded mb-4"
                    />
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">Create</button>
                </form>
            </Modal>

            {/* User Modal */}
            <Modal show={showUserModal} onClose={() => setShowUserModal(false)} title="Add User">
                <form onSubmit={handleCreateUser}>
                    <input
                        type="text"
                        placeholder="Full Name"
                        value={newUser.name}
                        onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
                        className="w-full p-2 mb-3 border rounded"
                    />
                    <input
                        type="text"
                        placeholder="Designation"
                        value={newUser.designation}
                        onChange={e => setNewUser(u => ({ ...u, designation: e.target.value }))}
                        className="w-full p-2 mb-3 border rounded"
                    />
                    <select
                        value={newUser.departmentId}
                        onChange={e => setNewUser(u => ({ ...u, departmentId: e.target.value, committeeId: '' }))}
                        className="w-full p-2 mb-3 border rounded"
                    >
                        <option value="">Select Department</option>
                        {departments.map(dep => (
                            <option key={dep.id} value={dep.id}>{dep.name}</option>
                        ))}
                    </select>
                    <div className="text-center my-2 text-gray-600">OR</div>
                    <select
                        value={newUser.committeeId}
                        onChange={e => setNewUser(u => ({ ...u, committeeId: e.target.value, departmentId: '' }))}
                        className="w-full p-2 mb-3 border rounded"
                    >
                        <option value="">Select Committee</option>
                        {committees.map(com => (
                            <option key={com.id} value={com.id}>{com.name}</option>
                        ))}
                    </select>
                    <label className="flex items-center space-x-2 mb-4">
                        <input
                            type="checkbox"
                            checked={newUser.eligibleForDemandCreation}
                            onChange={e =>
                                setNewUser(u => ({
                                    ...u,
                                    eligibleForDemandCreation: e.target.checked
                                }))
                            } className="form-checkbox h-5 w-5 text-indigo-600"
                        />
                        <span>Eligible for demand creation</span>
                    </label>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">Add User</button>
                </form>
            </Modal>

            {/* Demand Management Tab */}
            {activeTab === 'demands' && (
                <DemandManagement />
            )}
        </div>
    );
};

export default AdminDashboard;
