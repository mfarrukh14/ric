import React, { useMemo, useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    ComposedChart,
    Area,
    AreaChart
} from 'recharts';

const CostAnalysisChart = ({ itemStatuses, filteredItems }) => {
    // Auto-refresh effect when data changes
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    
    // Update timestamp when itemStatuses change to trigger re-renders
    React.useEffect(() => {
        setLastUpdate(Date.now());
    }, [itemStatuses]);
    // Prepare data for cost comparison chart
    const costComparisonData = useMemo(() => {
        return filteredItems.map((item, index) => {
            const status = itemStatuses.find(s => s.itemId === item.id);
            if (!status) return null;

            const prevYearCost = status.prevYearCost || 0;
            const currentYearCost = status.currentYearCost || 0;
            const storeEstimatedCost = status.storeEstimatedCost || 0;
            const requestedQuantity = status.requestedQuantity || 0;
            const calculatedRequiredQty = status.calculatedRequiredQty || 0;

            // Calculate projected costs based on actual fulfillment
            const projectedCostBasedOnFulfillment = (storeEstimatedCost / requestedQuantity) * calculatedRequiredQty;
            
            return {
                itemName: status.itemName.length > 15 ? status.itemName.substring(0, 15) + '...' : status.itemName,
                fullItemName: status.itemName,
                prevYearCost: prevYearCost,
                currentYearCost: currentYearCost,
                storeEstimatedCost: storeEstimatedCost,
                projectedFulfillmentCost: isNaN(projectedCostBasedOnFulfillment) ? 0 : projectedCostBasedOnFulfillment,
                requestedQuantity: requestedQuantity,
                calculatedRequiredQty: calculatedRequiredQty,
                fulfillmentPercentage: requestedQuantity > 0 ? (calculatedRequiredQty / requestedQuantity) * 100 : 0,
                costPerUnit: requestedQuantity > 0 ? currentYearCost / requestedQuantity : 0,
                status: status.status,
                categoryName: status.categoryName,
                stockInHand: status.stockInHand || 0,
                consumptionAmount: status.consumptionAmount || 0,
                consumptionType: status.consumptionType || 'monthly'
            };
        }).filter(Boolean);
    }, [itemStatuses, filteredItems]);

    // Calculate summary statistics
    const summaryStats = useMemo(() => {
        const totalPrevYear = costComparisonData.reduce((sum, item) => sum + item.prevYearCost, 0);
        const totalCurrentYear = costComparisonData.reduce((sum, item) => sum + item.currentYearCost, 0);
        const totalStoreEstimated = costComparisonData.reduce((sum, item) => sum + item.storeEstimatedCost, 0);
        const totalProjectedFulfillment = costComparisonData.reduce((sum, item) => sum + item.projectedFulfillmentCost, 0);
        
        const yearOverYearChange = totalPrevYear > 0 ? ((totalCurrentYear - totalPrevYear) / totalPrevYear) * 100 : 0;
        const estimatedVsRequested = totalCurrentYear > 0 ? ((totalStoreEstimated - totalCurrentYear) / totalCurrentYear) * 100 : 0;
        const fulfillmentSavings = totalCurrentYear - totalProjectedFulfillment;
        const fulfillmentSavingsPercentage = totalCurrentYear > 0 ? (fulfillmentSavings / totalCurrentYear) * 100 : 0;

        return {
            totalPrevYear,
            totalCurrentYear,
            totalStoreEstimated,
            totalProjectedFulfillment,
            yearOverYearChange,
            estimatedVsRequested,
            fulfillmentSavings,
            fulfillmentSavingsPercentage
        };
    }, [costComparisonData]);

    // Prepare data for fulfillment status pie chart
    const statusData = useMemo(() => {
        const statusCounts = costComparisonData.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {});

        return Object.entries(statusCounts).map(([status, count]) => ({
            name: status.replace('_', ' ').toUpperCase(),
            value: count,
            percentage: (count / costComparisonData.length) * 100
        }));
    }, [costComparisonData]);

    // Prepare data for consumption analysis
    const consumptionAnalysisData = useMemo(() => {
        return costComparisonData.map(item => {
            const monthsMultiplier = item.consumptionType === 'yearly' ? 12 : 
                                   item.consumptionType === 'quarterly' ? 3 : 1;
            const monthlyConsumption = item.consumptionAmount / monthsMultiplier;
            const monthsOfStock = item.stockInHand > 0 ? item.stockInHand / monthlyConsumption : 0;
            
            return {
                ...item,
                monthlyConsumption,
                monthsOfStock,
                stockStatus: monthsOfStock > 6 ? 'Adequate' : monthsOfStock > 3 ? 'Moderate' : 'Low'
            };
        });
    }, [costComparisonData]);

    const COLORS = {
        available: '#10B981',
        partial: '#F59E0B', 
        not_available: '#EF4444',
        prevYear: '#6366F1',
        currentYear: '#8B5CF6',
        storeEstimated: '#06B6D4',
        projected: '#F97316'
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">{data.fullItemName}</h4>
                    <div className="space-y-1 text-sm">
                        {payload.map((entry, index) => (
                            <div key={index} className="flex justify-between items-center">
                                <span style={{ color: entry.color }}>{entry.name}:</span>
                                <span className="font-medium">Rs {entry.value.toLocaleString()}</span>
                            </div>
                        ))}
                        <hr className="my-2" />
                        <div className="text-xs text-gray-600">
                            <div>Requested: {data.requestedQuantity} units</div>
                            <div>Fulfilling: {data.calculatedRequiredQty} units ({data.fulfillmentPercentage.toFixed(1)}%)</div>
                            <div>Status: {data.status.replace('_', ' ').toUpperCase()}</div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    const StatusPieTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0];
            return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <div className="font-semibold">{data.payload.name}</div>
                    <div className="text-sm">Count: {data.value}</div>
                    <div className="text-sm">Percentage: {data.payload.percentage.toFixed(1)}%</div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6">
            {/* Real-time Update Indicator */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Cost Analysis & Projections</h2>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Live Updates</span>
                    <span className="text-xs">
                        Last updated: {new Date(lastUpdate).toLocaleTimeString()}
                    </span>
                </div>
            </div>
            {/* Summary Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600">Total Current Year Cost</div>
                    <div className="text-2xl font-bold text-gray-900">Rs {summaryStats.totalCurrentYear.toLocaleString()}</div>
                    <div className={`text-sm ${summaryStats.yearOverYearChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {summaryStats.yearOverYearChange >= 0 ? '↑' : '↓'} {Math.abs(summaryStats.yearOverYearChange).toFixed(1)}% vs last year
                    </div>
                </div>
                
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600">Store Estimated Cost</div>
                    <div className="text-2xl font-bold text-blue-600">Rs {summaryStats.totalStoreEstimated.toLocaleString()}</div>
                    <div className={`text-sm ${summaryStats.estimatedVsRequested >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {summaryStats.estimatedVsRequested >= 0 ? '↑' : '↓'} {Math.abs(summaryStats.estimatedVsRequested).toFixed(1)}% vs requested
                    </div>
                </div>
                
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600">Projected Fulfillment Cost</div>
                    <div className="text-2xl font-bold text-orange-600">Rs {summaryStats.totalProjectedFulfillment.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Based on actual quantities</div>
                </div>
                
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600">Potential Savings</div>
                    <div className="text-2xl font-bold text-green-600">Rs {summaryStats.fulfillmentSavings.toLocaleString()}</div>
                    <div className="text-sm text-green-600">
                        {summaryStats.fulfillmentSavingsPercentage.toFixed(1)}% cost reduction
                    </div>
                </div>
            </div>

            {/* Cost Comparison Chart */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Analysis by Item</h3>
                <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={costComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="itemName" 
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                interval={0}
                            />
                            <YAxis />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="prevYearCost" fill={COLORS.prevYear} name="Previous Year Cost" />
                            <Bar dataKey="currentYearCost" fill={COLORS.currentYear} name="Current Year Cost" />
                            <Bar dataKey="storeEstimatedCost" fill={COLORS.storeEstimated} name="Store Estimated Cost" />
                            <Bar dataKey="projectedFulfillmentCost" fill={COLORS.projected} name="Projected Fulfillment Cost" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Fulfillment Status Distribution */}
                <div className="bg-white p-6 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Fulfillment Status Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percentage }) => `${name} (${percentage.toFixed(1)}%)`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={COLORS[entry.name.toLowerCase().replace(' ', '_')] || '#8884d8'} 
                                        />
                                    ))}
                                </Pie>
                                <Tooltip content={<StatusPieTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Stock vs Consumption Analysis */}
                <div className="bg-white p-6 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock vs Consumption Analysis</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={consumptionAnalysisData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="itemName" 
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                    interval={0}
                                />
                                <YAxis />
                                <Tooltip 
                                    formatter={(value, name) => [
                                        name === 'monthsOfStock' ? `${value.toFixed(1)} months` : value,
                                        name === 'monthsOfStock' ? 'Months of Stock' : 
                                        name === 'stockInHand' ? 'Stock in Hand' :
                                        name === 'monthlyConsumption' ? 'Monthly Consumption' : name
                                    ]}
                                />
                                <Legend />
                                <Bar dataKey="stockInHand" fill="#10B981" name="Stock in Hand" />
                                <Bar dataKey="monthlyConsumption" fill="#F59E0B" name="Monthly Consumption" />
                                <Bar dataKey="monthsOfStock" fill="#6366F1" name="Months of Stock" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Cost Trend Analysis */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Per Unit Analysis</h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={costComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="itemName" 
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                interval={0}
                            />
                            <YAxis />
                            <Tooltip 
                                formatter={(value) => [`Rs ${value.toFixed(2)}`, 'Cost per Unit']}
                                labelFormatter={(label) => `Item: ${label}`}
                            />
                            <Legend />
                            <Line 
                                type="monotone" 
                                dataKey="costPerUnit" 
                                stroke="#8B5CF6" 
                                strokeWidth={2}
                                dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                                name="Cost per Unit"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Detailed Stock Analysis Table */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Stock Analysis</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock in Hand</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Consumption</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Months of Stock</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fulfillment %</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Impact</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {consumptionAnalysisData.map((item, index) => (
                                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {item.fullItemName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            item.stockStatus === 'Adequate' ? 'bg-green-100 text-green-800' :
                                            item.stockStatus === 'Moderate' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-red-100 text-red-800'
                                        }`}>
                                            {item.stockStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {item.stockInHand}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {item.monthlyConsumption.toFixed(1)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {item.monthsOfStock.toFixed(1)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {item.fulfillmentPercentage.toFixed(1)}%
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        Rs {(item.currentYearCost - item.projectedFulfillmentCost).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CostAnalysisChart;
