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
    deleteUser,
    getItemCategories,
    getAllItemNames,
    createItemCategory,
    createItemName,
    updateItemCategory,
    updateItemName,
    deleteItemCategory,
    deleteItemName,
    getItemNamesByCategory
} from '../../config/api';
import Modal from '../modals/Modal';
import UserListModal from '../modals/UserListModal';
import DemandManagement from './DemandManagement';
import GrievanceDeadlineManagement from './GrievanceDeadlineManagement';
import TwoFactorSetup from '../auth/TwoFactorSetup/TwoFactorSetup';
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
    const [itemCategories, setItemCategories] = useState([]);
    const [itemNames, setItemNames] = useState([]);
    const [activeTab, setActiveTab] = useState('management'); // management, items, demands, grievances
    const [showDepartmentModal, setShowDepartmentModal] = useState(false);
    const [showCommitteeModal, setShowCommitteeModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showUserListModal, setShowUserListModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showItemNameModal, setShowItemNameModal] = useState(false);
    const [show2FASetup, setShow2FASetup] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState({ id: null, type: '' });
    const [searchTerm, setSearchTerm] = useState('');

    const [newName, setNewName] = useState('');
    const [newUser, setNewUser] = useState({
        name: '', designation: '', departmentId: '', committeeId: '', eligibleForDemandCreation: false
    });
    const [newCategory, setNewCategory] = useState({ name: '', description: '' });
    const [newItemName, setNewItemName] = useState({ categoryId: '', name: '', description: '' });
    const [editingItem, setEditingItem] = useState(null);
    const [error, setError] = useState('');
    const [createdCredentials, setCreatedCredentials] = useState(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        try {
            const [d, c, u, ic, in_] = await Promise.all([
                listDepartments(), 
                listCommittees(), 
                listUsers(), 
                getItemCategories(), 
                getAllItemNames()
            ]);
            setDepartments(d);
            setCommittees(c);
            setUsers(u);
            setItemCategories(ic);
            setItemNames(in_);
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

    // Item Management Handlers
    const handleCreateCategory = async (e) => {
        e.preventDefault();
        if (!newCategory.name.trim()) {
            setError('Category name is required');
            return;
        }
        try {
            await createItemCategory(newCategory);
            setNewCategory({ name: '', description: '' });
            setShowCategoryModal(false);
            fetchAll();
        } catch (error) {
            setError(error.error || 'Failed to create category');
        }
    };

    const handleEditCategory = (category) => {
        setEditingItem(category);
        setNewCategory({ name: category.name, description: category.description || '' });
        setShowCategoryModal(true);
    };

    const handleUpdateCategory = async (e) => {
        e.preventDefault();
        if (!newCategory.name.trim()) {
            setError('Category name is required');
            return;
        }
        try {
            await updateItemCategory(editingItem.id, newCategory);
            setNewCategory({ name: '', description: '' });
            setEditingItem(null);
            setShowCategoryModal(false);
            fetchAll();
        } catch (error) {
            setError(error.error || 'Failed to update category');
        }
    };

    const handleDeleteCategory = async (categoryId) => {
        if (window.confirm('Are you sure you want to delete this category? This will also delete all associated item names.')) {
            try {
                await deleteItemCategory(categoryId);
                fetchAll();
            } catch (error) {
                setError(error.error || 'Failed to delete category');
            }
        }
    };

    const handleCreateItemName = async (e) => {
        e.preventDefault();
        if (!newItemName.categoryId || !newItemName.name.trim()) {
            setError('Category and item name are required');
            return;
        }
        try {
            await createItemName(newItemName);
            setNewItemName({ categoryId: '', name: '', description: '' });
            setShowItemNameModal(false);
            fetchAll();
        } catch (error) {
            setError(error.error || 'Failed to create item name');
        }
    };

    const handleEditItemName = (item) => {
        setEditingItem(item);
        setNewItemName({ 
            categoryId: item.category_id, 
            name: item.name, 
            description: item.description || '' 
        });
        setShowItemNameModal(true);
    };

    const handleUpdateItemName = async (e) => {
        e.preventDefault();
        if (!newItemName.categoryId || !newItemName.name.trim()) {
            setError('Category and item name are required');
            return;
        }
        try {
            await updateItemName(editingItem.id, newItemName);
            setNewItemName({ categoryId: '', name: '', description: '' });
            setEditingItem(null);
            setShowItemNameModal(false);
            fetchAll();
        } catch (error) {
            setError(error.error || 'Failed to update item name');
        }
    };

    const handleDeleteItemName = async (itemId) => {
        if (window.confirm('Are you sure you want to delete this item name?')) {
            try {
                await deleteItemName(itemId);
                fetchAll();
            } catch (error) {
                setError(error.error || 'Failed to delete item name');
            }
        }
    };

    const handleCloseCategoryModal = () => {
        setShowCategoryModal(false);
        setEditingItem(null);
        setNewCategory({ name: '', description: '' });
        setError('');
    };

    const handleCloseItemNameModal = () => {
        setShowItemNameModal(false);
        setEditingItem(null);
        setNewItemName({ categoryId: '', name: '', description: '' });
        setError('');
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
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-black">Admin Dashboard</h1>
                <button
                    onClick={() => setShow2FASetup(true)}
                    className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 flex items-center"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Security Settings
                </button>
            </div>

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
                    onClick={() => setActiveTab('items')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'items'
                            ? 'bg-white bg-opacity-30 text-black font-medium'
                            : 'text-gray-700 hover:bg-white hover:bg-opacity-20'
                        }`}
                >
                    <Package size={20} />
                    <span>Item Management</span>
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

            {/* Item Management Tab */}
            {activeTab === 'items' && (
                <div className="space-y-6">
                    {/* Item Categories Table */}
                    <div className={glassTableClass}>
                        <div className="flex justify-between items-center p-4">
                            <h2 className="text-xl font-semibold text-black">Item Categories</h2>
                            <button
                                onClick={() => setShowCategoryModal(true)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                            >
                                <UserPlus size={16} />
                                <span>Add Category</span>
                            </button>
                        </div>
                        <table className="w-full">
                            <thead>
                                <tr className="bg-black bg-opacity-10">
                                    <th className="text-left p-3 text-black font-medium">Name</th>
                                    <th className="text-left p-3 text-black font-medium">Description</th>
                                    <th className="text-left p-3 text-black font-medium">Items Count</th>
                                    <th className="text-left p-3 text-black font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemCategories.length === 0 ? (
                                    <tr><td colSpan="4" className="text-center p-6 text-black">No categories found</td></tr>
                                ) : (
                                    itemCategories.map(category => (
                                        <tr key={category.id} className="border-t border-white border-opacity-20">
                                            <td className="p-3 text-black">{category.name}</td>
                                            <td className="p-3 text-black">{category.description || 'No description'}</td>
                                            <td className="p-3 text-black">
                                                {itemNames.filter(item => item.category_id === category.id).length}
                                            </td>
                                            <td className="p-3 space-x-2">
                                                <button
                                                    onClick={() => handleEditCategory(category)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCategory(category.id)}
                                                    className="text-red-600 hover:text-red-800"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Item Names Table */}
                    <div className={glassTableClass}>
                        <div className="flex justify-between items-center p-4">
                            <h2 className="text-xl font-semibold text-black">Item Names</h2>
                            <button
                                onClick={() => setShowItemNameModal(true)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                            >
                                <UserPlus size={16} />
                                <span>Add Item Name</span>
                            </button>
                        </div>
                        <table className="w-full">
                            <thead>
                                <tr className="bg-black bg-opacity-10">
                                    <th className="text-left p-3 text-black font-medium">Item Name</th>
                                    <th className="text-left p-3 text-black font-medium">Category</th>
                                    <th className="text-left p-3 text-black font-medium">Description</th>
                                    <th className="text-left p-3 text-black font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemNames.length === 0 ? (
                                    <tr><td colSpan="4" className="text-center p-6 text-black">No item names found</td></tr>
                                ) : (
                                    itemNames.map(item => (
                                        <tr key={item.id} className="border-t border-white border-opacity-20">
                                            <td className="p-3 text-black">{item.name}</td>
                                            <td className="p-3 text-black">{item.category_name}</td>
                                            <td className="p-3 text-black">{item.description || 'No description'}</td>
                                            <td className="p-3 space-x-2">
                                                <button
                                                    onClick={() => handleEditItemName(item)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteItemName(item.id)}
                                                    className="text-red-600 hover:text-red-800"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
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

            {/* Category Modal */}
            <Modal 
                show={showCategoryModal} 
                onClose={handleCloseCategoryModal} 
                title={editingItem ? "Edit Category" : "Add Category"}
            >
                {error && <div className="mb-4 text-red-600">{error}</div>}
                <form onSubmit={editingItem ? handleUpdateCategory : handleCreateCategory}>
                    <input
                        type="text"
                        placeholder="Category Name"
                        value={newCategory.name}
                        onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full p-2 border rounded mb-3"
                        required
                    />
                    <textarea
                        placeholder="Description (optional)"
                        value={newCategory.description}
                        onChange={e => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full p-2 border rounded mb-4"
                        rows="3"
                    />
                    <button 
                        type="submit" 
                        className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700"
                    >
                        {editingItem ? 'Update Category' : 'Create Category'}
                    </button>
                </form>
            </Modal>

            {/* Item Name Modal */}
            <Modal 
                show={showItemNameModal} 
                onClose={handleCloseItemNameModal} 
                title={editingItem ? "Edit Item Name" : "Add Item Name"}
            >
                {error && <div className="mb-4 text-red-600">{error}</div>}
                <form onSubmit={editingItem ? handleUpdateItemName : handleCreateItemName}>
                    <select
                        value={newItemName.categoryId}
                        onChange={e => setNewItemName(prev => ({ ...prev, categoryId: e.target.value }))}
                        className="w-full p-2 border rounded mb-3"
                        required
                    >
                        <option value="">Select Category</option>
                        {itemCategories.map(category => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="Item Name"
                        value={newItemName.name}
                        onChange={e => setNewItemName(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full p-2 border rounded mb-3"
                        required
                    />
                    <textarea
                        placeholder="Description (optional)"
                        value={newItemName.description}
                        onChange={e => setNewItemName(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full p-2 border rounded mb-4"
                        rows="3"
                    />
                    <button 
                        type="submit" 
                        className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700"
                    >
                        {editingItem ? 'Update Item Name' : 'Create Item Name'}
                    </button>
                </form>
            </Modal>

            {/* Demand Management Tab */}
            {activeTab === 'demands' && (
                <DemandManagement />
            )}

            {/* 2FA Setup Modal */}
            {show2FASetup && (
                <TwoFactorSetup onClose={() => setShow2FASetup(false)} />
            )}
        </div>
    );
};

export default AdminDashboard;
