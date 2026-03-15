import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { appClient } from '@/api/appClient';
import { useEffect, useState } from 'react';
import { hasPageAccess } from "@/lib/accessControl";
import { Loader2 } from "lucide-react";

// Layout stays eagerly loaded (always needed)
import Layout from "./Layout.jsx";

// Lazy-loaded pages — each gets its own chunk
const AppConnection = lazy(() => import("./AppConnection"));
const Customers = lazy(() => import("./Customers"));
const Dashboard = lazy(() => import("./Dashboard"));
const Statistics = lazy(() => import("./Statistics"));
const CustomerInvoice = lazy(() => import("./CustomerInvoice"));
const DriverChecklist = lazy(() => import("./DriverChecklist"));
const DriverOrders = lazy(() => import("./DriverOrders"));
const DriverProtocol = lazy(() => import("./DriverProtocol"));
const DriverProfile = lazy(() => import("./DriverProfile"));
const DriverSupport = lazy(() => import("./DriverSupport"));
const Drivers = lazy(() => import("./Drivers"));
const Orders = lazy(() => import("./Orders"));
const DriverPriceRequests = lazy(() => import("./DriverPriceRequests"));
const AdminControlling = lazy(() => import("./AdminControlling"));
const AIImport = lazy(() => import("./AIImport"));
const EmailAIImport = lazy(() => import("./EmailAIImport"));
const TransferFleetAI = lazy(() => import("./TransferFleetAI"));
const Login = lazy(() => import("./Login"));
const LoginDriver = lazy(() => import("./LoginDriver"));
const LoginStaff = lazy(() => import("./LoginStaff"));
const LoginExecutive = lazy(() => import("./LoginExecutive"));
const DriverAccess = lazy(() => import("./DriverAccess"));
const DriverLicensePublic = lazy(() => import("./DriverLicensePublic"));
const ResetPassword = lazy(() => import("./ResetPassword"));
const TeamTransferFleet = lazy(() => import("./TeamTransferFleet"));
const AccessDenied = lazy(() => import("./AccessDenied"));
const Terminal = lazy(() => import("./Terminal"));
const SystemVermietung = lazy(() => import("./SystemVermietung"));
const Upgrade = lazy(() => import("./Upgrade"));
const Settings = lazy(() => import("./Settings"));
const Verlauf = lazy(() => import("./Verlauf"));
const AdminEmailSettings = lazy(() => import("./AdminEmailSettings"));
const ProtocolPdf = lazy(() => import("./ProtocolPdf"));
const ExpensesPdf = lazy(() => import("./ExpensesPdf"));

const PAGE_NAMES = [
    'AppConnection',
    'Customers',
    'Dashboard',
    'Statistics',
    'CustomerInvoice',
    'DriverChecklist',
    'DriverOrders',
    'DriverProtocol',
    'DriverProfile',
    'DriverSupport',
    'Drivers',
    'Orders',
    'DriverPriceRequests',
    'AdminControlling',
    'AdminEmailSettings',
    'AIImport',
    'EmailAIImport',
    'TransferFleetAI',
    'TeamTransferFleet',
    'Terminal',
    'SystemVermietung',
    'Verlauf',
    'Upgrade',
    'Settings',
];

function PageFallback() {
    return (
        <div className="flex items-center justify-center h-full min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    if (urlLastPart.toLowerCase() === 'checklists') {
        return 'Orders';
    }
    const pageName = PAGE_NAMES.find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || PAGE_NAMES[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const normalizedPath = location.pathname.toLowerCase();
    const searchParams = new URLSearchParams(location.search);
    const checklistIdParam = searchParams.get('id');
    const isChecklistPdfRoute = normalizedPath === '/checklists' && Boolean(checklistIdParam);
    const isLoginRoute = normalizedPath === '/login' || normalizedPath.startsWith('/login/');
    const isResetRoute = normalizedPath === '/reset-password';
    const isSetPasswordRoute = normalizedPath === '/set-password';
    const isDriverAccessRoute = normalizedPath === '/driver';
    const isDriverLicenseRoute = normalizedPath === '/driver-license';
    const isProtocolPdfRoute = normalizedPath === '/protocol-pdf';
    const isExpensesPdfRoute = normalizedPath === '/expenses-pdf';
    const isPublicPrintRoute = isChecklistPdfRoute || isProtocolPdfRoute || isExpensesPdfRoute;
    const currentPage = _getCurrentPage(location.pathname);
    const [currentUser, setCurrentUser] = useState(null);
    const [authChecked, setAuthChecked] = useState(isPublicPrintRoute);

    useEffect(() => {
        if (isPublicPrintRoute) {
            setAuthChecked(true);
            return () => {};
        }
        let isMounted = true;
        const loadUser = async () => {
            const user = await appClient.auth.getCurrentUser();
            if (isMounted) {
                setCurrentUser(user);
                setAuthChecked(true);
            }
        };
        loadUser();
        return () => {
            isMounted = false;
        };
    }, [normalizedPath, isPublicPrintRoute]);

    if (isChecklistPdfRoute) {
        return (
            <Navigate
                to={`/protocol-pdf?checklistId=${encodeURIComponent(checklistIdParam)}`}
                replace
            />
        );
    }

    if (isLoginRoute || isResetRoute || isSetPasswordRoute || isDriverAccessRoute || isDriverLicenseRoute || isProtocolPdfRoute || isExpensesPdfRoute) {
        // If user is already logged in and on a login page, redirect to app
        if (isLoginRoute && authChecked && currentUser) {
            const target = currentUser.role === 'driver' ? '/DriverOrders' : '/Dashboard';
            return <Navigate to={target} replace />;
        }
        return (
            <Suspense fallback={<PageFallback />}>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/login/driver" element={<LoginDriver />} />
                    <Route path="/login/staff" element={<LoginStaff />} />
                    <Route path="/login/executive" element={<LoginExecutive />} />
                    <Route path="/driver" element={<DriverAccess />} />
                    <Route path="/driver-license" element={<DriverLicensePublic />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/set-password" element={<ResetPassword />} />
                    <Route path="/protocol-pdf" element={<ProtocolPdf />} />
                    <Route path="/expenses-pdf" element={<ExpensesPdf />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </Suspense>
        );
    }

    if (!authChecked) {
        return null;
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    const driverAllowedPages = [
        'DriverOrders',
        'DriverChecklist',
        'DriverProtocol',
        'DriverProfile',
        'DriverSupport',
    ];

    if (currentUser.role === 'driver' && !driverAllowedPages.includes(currentPage)) {
        return <Navigate to={createPageUrl('DriverOrders')} replace />;
    }

    if (!hasPageAccess(currentUser, currentPage)) {
        return (
            <Layout currentPageName={currentPage}>
                <Suspense fallback={<PageFallback />}>
                    <AccessDenied />
                </Suspense>
            </Layout>
        );
    }

    return (
        <Layout currentPageName={currentPage}>
            <Suspense fallback={<PageFallback />}>
                <Routes>

                        <Route path="/" element={<Navigate to={createPageUrl('Dashboard')} replace />} />


                    <Route path="/AppConnection" element={<Navigate to="/Settings" replace />} />

                    <Route path="/Checklists" element={<Navigate to={createPageUrl('Orders')} replace />} />

                    <Route path="/Customers" element={<Customers />} />

                    <Route path="/Dashboard" element={<Dashboard />} />

                    <Route path="/Statistics" element={<Statistics />} />

                    <Route path="/CustomerInvoice" element={<CustomerInvoice />} />

                    <Route path="/DriverChecklist" element={<DriverChecklist />} />

                    <Route path="/DriverOrders" element={<DriverOrders />} />

                    <Route path="/DriverProtocol" element={<DriverProtocol />} />


                    <Route path="/DriverProfile" element={<DriverProfile />} />

                    <Route path="/DriverSupport" element={<DriverSupport />} />

                    <Route path="/Drivers" element={<Drivers />} />

                    <Route path="/Orders" element={<Orders />} />

                    <Route path="/DriverPriceRequests" element={<DriverPriceRequests />} />

                    <Route path="/Search" element={<Navigate to={createPageUrl('Dashboard')} replace />} />

                    <Route path="/AdminControlling" element={<AdminControlling />} />

                    <Route path="/AdminEmailSettings" element={<AdminEmailSettings />} />

                    <Route path="/AIImport" element={<AIImport />} />

                    <Route path="/EmailAIImport" element={<EmailAIImport />} />

                    <Route path="/TransferFleetAI" element={<TransferFleetAI />} />

                    <Route path="/TeamTransferFleet" element={<TeamTransferFleet />} />

                    <Route path="/Terminal" element={<Terminal />} />

                    <Route path="/SystemVermietung" element={<SystemVermietung />} />

                    <Route path="/Upgrade" element={<Upgrade />} />
                    <Route path="/Settings" element={<Settings />} />

                    <Route path="/verlauf" element={<Verlauf />} />

                </Routes>
            </Suspense>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
