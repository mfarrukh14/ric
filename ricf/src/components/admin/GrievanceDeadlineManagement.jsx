import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { apiUrl } from '../../config/api';

import { formatDate } from '../../lib/time';
const GrievanceDeadlineManagement = () => {
    const [config, setConfig] = useState({
        grievance_deadline_hours: 72
    });
    const [deadlines, setDeadlines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [timeUnit, setTimeUnit] = useState('hours'); // 'minutes' or 'hours'
    const [timeValue, setTimeValue] = useState(72);

    useEffect(() => {
        fetchConfig();
        fetchActiveDeadlines();
    }, []);

    const fetchConfig = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${apiUrl}/admin/grievance-deadline-config`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConfig(response.data);
            
            // Set initial values for the time input
            const hours = response.data.grievance_deadline_hours;
            if (hours < 1) {
                setTimeValue(Math.round(hours * 60));
                setTimeUnit('minutes');
            } else {
                setTimeValue(hours);
                setTimeUnit('hours');
            }
        } catch (error) {
            console.error('Error fetching config:', error);
            toast.error('Failed to fetch configuration');
        }
    };

    const fetchActiveDeadlines = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${apiUrl}/admin/grievance-deadlines`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDeadlines(response.data);
        } catch (error) {
            console.error('Error fetching deadlines:', error);
            toast.error('Failed to fetch active deadlines');
        } finally {
            setLoading(false);
        }
    };

    const handleConfigUpdate = async (e) => {
        e.preventDefault();
        setSaving(true);
        
        try {
            const token = localStorage.getItem('token');
            const response = await axios.put(`${apiUrl}/admin/grievance-deadline-config`, config, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // Show detailed success message
            const data = response.data;
            if (data.updated_active_deadlines > 0) {
                toast.success(`Configuration updated. ${data.updated_active_deadlines} active deadline(s) were also updated with the new timeframe.`);
            } else {
                toast.success('Configuration updated');
            }
            
            // Refresh the active deadlines to show updated times
            fetchActiveDeadlines();
        } catch (error) {
            console.error('Error updating config:', error);
            toast.error('Failed to update configuration');
        } finally {
            setSaving(false);
        }
    };

    const handleTimeValueChange = (value) => {
        setTimeValue(value);
        
        // Convert to hours for the config
        let hoursValue;
        if (timeUnit === 'minutes') {
            hoursValue = value / 60;
        } else {
            hoursValue = value;
        }
        
        setConfig({
            ...config,
            grievance_deadline_hours: hoursValue
        });
    };

    const handleTimeUnitChange = (unit) => {
        const currentHours = config.grievance_deadline_hours;
        
        if (unit === 'minutes') {
            // Convert hours to minutes
            const minutes = Math.round(currentHours * 60);
            setTimeValue(minutes);
        } else {
            // Convert minutes to hours if coming from minutes
            if (timeUnit === 'minutes') {
                setTimeValue(currentHours);
            }
        }
        
        setTimeUnit(unit);
    };

    const formatTimeRemaining = (timeRemainingMs) => {
        if (timeRemainingMs <= 0) return 'Expired';
        
        const hours = Math.floor(timeRemainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} day${days > 1 ? 's' : ''} remaining`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m remaining`;
        } else {
            return `${minutes}m remaining`;
        }
    };

    const getStatusBadge = (hasExpired) => {
        if (hasExpired) {
            return (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Expired
                </span>
            );
        } else {
            return (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100">
                    Active
                </span>
            );
        }
    };

    const getTimeDisplayText = () => {
        const hours = config.grievance_deadline_hours;
        if (hours < 1) {
            const minutes = Math.round(hours * 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else if (hours < 24) {
            return `${hours} hour${hours !== 1 ? 's' : ''} (${Math.round(hours * 60)} minutes)`;
        } else {
            const days = Math.round(hours / 24 * 10) / 10;
            return `${hours} hours (${days} day${days !== 1 ? 's' : ''})`;
        }
    };

    const getMinMaxValues = () => {
        if (timeUnit === 'minutes') {
            return { min: 1, max: 4320, step: 1 }; // 1 minute to 72 hours (4320 minutes)
        } else {
            return { min: 0.0167, max: 72, step: 0.0167 }; // ~1 minute to 72 hours
        }
    };

    return (
        <div>

            {/* Configuration Section */}
            <div className="ui-panel ui-panel--pad mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <i className="fas fa-cog mr-2 text-gray-600"></i>
                    Deadline configuration
                </h3>
                
                <form onSubmit={handleConfigUpdate} className="space-y-4">
                    <div>
                        <label className="ui-label block mb-2">
                            Grievance application deadline
                        </label>
                        <div className="flex items-center space-x-4">
                            <input
                                type="number"
                                {...getMinMaxValues()}
                                value={timeValue}
                                onChange={(e) => handleTimeValueChange(parseFloat(e.target.value))}
                                className="ui-input w-32"
                                placeholder={timeUnit === 'minutes' ? 'Minutes' : 'Hours'}
                            />
                            <select
                                value={timeUnit}
                                onChange={(e) => handleTimeUnitChange(e.target.value)}
                                className="ui-input"
                            >
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                            </select>
                            <span className="text-sm text-gray-500">
                                after technical evaluation is completed
                            </span>
                        </div>
                        <div className="mt-2 space-y-1">
                            <p className="text-sm font-medium text-indigo-600">
                                Current setting: {getTimeDisplayText()}
                            </p>
                            <p className="text-xs text-gray-500">
                                {timeUnit === 'minutes' 
                                    ? 'Range: 1 minute to 4,320 minutes (72 hours)'
                                    : 'Range: 0.0167 hours (~1 minute) to 72 hours'
                                }
                            </p>
                        </div>
                        
                        {/* Quick preset buttons */}
                        <div className="mt-3">
                            <label className="ui-label block mb-2">Quick presets:</label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTimeUnit('minutes');
                                        handleTimeValueChange(5);
                                    }}
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                >
                                    5 min
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTimeUnit('minutes');
                                        handleTimeValueChange(30);
                                    }}
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                >
                                    30 min
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTimeUnit('hours');
                                        handleTimeValueChange(1);
                                    }}
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                >
                                    1 hour
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTimeUnit('hours');
                                        handleTimeValueChange(24);
                                    }}
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                >
                                    24 hours
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTimeUnit('hours');
                                        handleTimeValueChange(72);
                                    }}
                                    className="ui-btn ui-btn--ghost ui-btn--sm"
                                >
                                    72 hours (default)
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="ui-btn ui-btn--primary"
                        >
                            {saving ? (
                                <>
                                    <div className="ui-spin mr-2"></div>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-save mr-2"></i>
                                    Save configuration
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Active Deadlines Section */}
            <div className="ui-panel">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900 flex items-center">
                        <i className="fas fa-list mr-2 text-gray-600"></i>
                        Active grievance deadlines
                    </h3>
                    <button
                        onClick={fetchActiveDeadlines}
                        className="ui-btn ui-btn--secondary ui-btn--sm"
                    >
                        <i className="fas fa-sync-alt mr-1"></i>
                        Refresh
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="ui-spin"></div>
                        <p className="ml-3 text-gray-600">Loading deadlines...</p>
                    </div>
                ) : deadlines.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <i className="fas fa-calendar-times text-4xl text-gray-400 mb-4"></i>
                        <h4 className="text-lg font-medium text-gray-900 mb-2">No active deadlines</h4>
                        <p className="text-gray-500">There are currently no active grievance deadlines.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {deadlines.map((deadline) => (
                            <div key={deadline.id} className="p-6 hover:bg-gray-50">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3 mb-2">
                                            <h4 className="text-lg font-medium text-gray-900">
                                                {deadline.item_name}
                                            </h4>
                                            {getStatusBadge(deadline.hasExpired)}
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                                            <div>
                                                <span className="font-medium">Tender ID:</span> #{deadline.tender_id}
                                            </div>
                                            <div>
                                                <span className="font-medium">Started:</span>{' '}
                                                {formatDate(deadline.deadline_start)}
                                            </div>
                                            <div>
                                                <span className="font-medium">Expires:</span>{' '}
                                                {formatDate(deadline.deadline_end)}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="text-right">
                                        <div className={`text-sm font-medium ${
                                            deadline.hasExpired ? 'text-red-600' : 'text-green-600'
                                        }`}>
                                            {formatTimeRemaining(deadline.timeRemainingMs)}
                                        </div>
                                        {!deadline.hasExpired && (
                                            <div className="text-xs text-gray-500 mt-1">
                                                {deadline.timeRemainingHours}h remaining
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {deadline.description && (
                                    <div className="ui-callout mt-3">
                                        <p className="text-sm text-gray-700">{deadline.description}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GrievanceDeadlineManagement;