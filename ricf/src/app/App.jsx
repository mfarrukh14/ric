import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Slide, ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useSession } from '../lib/session';
import { play } from '../lib/sound';
import { clearNavBadges } from '../lib/navBadges';
import { ConfirmHost } from '../lib/confirm';
import { capabilitiesOf, homePathFor } from './navigation';
import { AppShell } from './AppShell';
import { LoadingBlock } from '../ui';

// Every screen is its own chunk; the first paint only loads the shell.
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const MyDemands = lazy(() => import('../pages/MyDemands'));
const AdminDashboard = lazy(() => import('../components/admin/AdminDashboard'));
const DemandManagement = lazy(() => import('../components/admin/DemandManagement'));
const SupplierEvaluation = lazy(() => import('../components/admin/SupplierEvaluation'));
const StorePurchaseOrders = lazy(() => import('../components/store/StorePurchaseOrders'));
const FulfillmentPage = lazy(() => import('../components/store/FulfillmentPage'));
const CreateDemandForm = lazy(() => import('../components/demand/CreateDemandForm'));
const PurchaseDepartment = lazy(() => import('../components/department/PurchaseDepartment'));
const TenderOpeningDetails = lazy(() => import('../components/purchase/TenderOpeningDetails'));
const HodDashboard = lazy(() => import('../components/hod/HodDashboard'));
const TechnicalEvaluationDashboard = lazy(() => import('../components/committee/TechnicalEvaluationDashboard'));
const TechnicalEvaluation = lazy(() => import('../components/committee/TechnicalEvaluation'));
const ItemWiseEvaluation = lazy(() => import('../components/committee/ItemWiseEvaluation'));
const GrievanceCommitteeNew = lazy(() => import('../components/committee/GrievanceCommitteeNew'));
const MarketSurveyCommittee = lazy(() => import('../components/committee/MarketSurveyCommittee'));
const VettingDashboard = lazy(() => import('../components/vetting/VettingDashboard'));
const TenderReviewPage = lazy(() => import('../components/vetting/TenderReviewPage'));
const SupplierDashboard = lazy(() => import('../components/supplier/SupplierDashboard'));
const Awards = lazy(() => import('../pages/supplier/Awards'));
const BidApplication = lazy(() => import('../components/supplier/BidApplication'));

/** Renders children only when the signed-in person passes `allow`; otherwise sends them home. */
function Gate({ user, allow, children }) {
    return allow(capabilitiesOf(user)) ? children : <Navigate to={homePathFor(user)} replace />;
}

/** Old bookmark /committee/vetting/tender/7 → /vetting/tender/7, and friends. */
function Redirect({ to }) {
    const params = useParams();
    return <Navigate to={to.replace(/:(\w+)/g, (_, key) => params[key] ?? '')} replace />;
}

function SignedInRoutes({ user }) {
    const staff = (can) => !can.supplier;
    return (
        <Routes>
            <Route element={<AppShell user={user} />}>
                <Route index element={<Navigate to={homePathFor(user)} replace />} />

                {/* Administration */}
                <Route path="admin/:tab?" element={<Gate user={user} allow={(c) => c.superadmin}><AdminDashboard /></Gate>} />

                {/* Staff workspace */}
                <Route path="demands" element={<Gate user={user} allow={staff}><MyDemands user={user} /></Gate>} />
                <Route path="create-demand" element={<Gate user={user} allow={(c) => c.canCreateDemand}><CreateDemandForm /></Gate>} />
                <Route path="approvals" element={<Gate user={user} allow={(c) => c.hod}><HodDashboard /></Gate>} />

                <Route path="store/demands" element={<Gate user={user} allow={(c) => c.store || c.superadmin}><DemandManagement /></Gate>} />
                <Route path="store/purchase-orders" element={<Gate user={user} allow={(c) => c.store}><StorePurchaseOrders /></Gate>} />
                <Route path="store/fulfillment/:demandId" element={<Gate user={user} allow={staff}><FulfillmentPage /></Gate>} />

                <Route path="purchase/:tab?" element={<Gate user={user} allow={(c) => c.purchase}><PurchaseDepartment /></Gate>} />
                <Route path="purchase-department/tender-opening/:tenderId" element={<Gate user={user} allow={staff}><TenderOpeningDetails /></Gate>} />

                <Route path="supplier-evaluation" element={<Gate user={user} allow={(c) => c.supplierEvaluation}><SupplierEvaluation /></Gate>} />
                <Route path="technical-evaluation" element={<Gate user={user} allow={staff}><TechnicalEvaluationDashboard /></Gate>} />
                <Route path="technical-evaluation/:tenderId" element={<Gate user={user} allow={staff}><TechnicalEvaluation /></Gate>} />
                <Route path="committee/technical-evaluation/:tenderId/evaluate" element={<Gate user={user} allow={staff}><ItemWiseEvaluation /></Gate>} />
                <Route path="vetting" element={<Gate user={user} allow={staff}><VettingDashboard /></Gate>} />
                <Route path="vetting/tender/:tenderId" element={<Gate user={user} allow={staff}><TenderReviewPage /></Gate>} />
                <Route path="grievances" element={<Gate user={user} allow={staff}><GrievanceCommitteeNew /></Gate>} />
                <Route path="market-survey" element={<Gate user={user} allow={(c) => c.marketSurvey}><MarketSurveyCommittee /></Gate>} />

                {/* Suppliers */}
                <Route path="supplier/awards" element={<Gate user={user} allow={(c) => c.supplier}><Awards /></Gate>} />
                <Route path="supplier/apply-bid/:tenderId" element={<Gate user={user} allow={(c) => c.supplier}><BidApplication /></Gate>} />
                <Route path="supplier/:tab?" element={<Gate user={user} allow={(c) => c.supplier}><SupplierDashboard /></Gate>} />

                {/* Addresses from before the redesign */}
                <Route path="dashboard" element={<Navigate to={homePathFor(user)} replace />} />
                <Route path="hod" element={<Navigate to="/approvals" replace />} />
                <Route path="supplier-dashboard" element={<Navigate to="/supplier/overview" replace />} />
                <Route path="purchase-department" element={<Navigate to="/purchase/demands" replace />} />
                <Route path="committee/technical-evaluation" element={<Navigate to="/technical-evaluation" replace />} />
                <Route path="committee/grievance" element={<Navigate to="/grievances" replace />} />
                <Route path="committee/vetting" element={<Navigate to="/vetting" replace />} />
                <Route path="committee/vetting/tender/:tenderId" element={<Redirect to="/vetting/tender/:tenderId" />} />

                <Route path="*" element={<Navigate to={homePathFor(user)} replace />} />
            </Route>
        </Routes>
    );
}

export default function App() {
    const user = useSession();

    // Toasts speak: a chime for success, a low tone for errors.
    useEffect(() => toast.onChange((event) => event.status === 'added' && play(event.type)), []);

    useEffect(() => {
        if (!user) clearNavBadges();
    }, [user]);

    return (
        <BrowserRouter>
            <Suspense fallback={<LoadingBlock />}>
                {user ? (
                    <SignedInRoutes user={user} />
                ) : (
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </Routes>
                )}
            </Suspense>
            <ConfirmHost />
            <ToastContainer position="bottom-right" autoClose={4000} hideProgressBar newestOnTop closeOnClick={false} pauseOnFocusLoss={false} transition={Slide} limit={4} />
        </BrowserRouter>
    );
}
