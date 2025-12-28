import Layout from "./Layout.jsx";

import AppConnection from "./AppConnection";

import Checklists from "./Checklists";

import Customers from "./Customers";

import Dashboard from "./Dashboard";

import DriverChecklist from "./DriverChecklist";

import DriverOrders from "./DriverOrders";

import DriverProtocol from "./DriverProtocol";

import DriverDocuments from "./DriverDocuments";

import DriverProfile from "./DriverProfile";

import DriverSupport from "./DriverSupport";

import Drivers from "./Drivers";

import Orders from "./Orders";

import Search from "./Search";

import AIImport from "./AIImport";

import AVOAI from "./AVOAI";

import Login from "./Login";
import LoginDriver from "./LoginDriver";
import LoginStaff from "./LoginStaff";
import LoginExecutive from "./LoginExecutive";
import DriverAccess from "./DriverAccess";
import ResetPassword from "./ResetPassword";
import SetPassword from "./SetPassword";
import TeamAVO from "./TeamAVO";
import AccessDenied from "./AccessDenied";
import Terminal from "./Terminal";
import SystemVermietung from "./SystemVermietung";
import Verlauf from "./Verlauf";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { appClient } from '@/api/appClient';
import { useEffect, useState } from 'react';
import { hasPageAccess } from "@/lib/accessControl";

const PAGES = {
    
    AppConnection: AppConnection,
    
    Checklists: Checklists,
    
    Customers: Customers,
    
    Dashboard: Dashboard,
    
    DriverChecklist: DriverChecklist,
    
    DriverOrders: DriverOrders,
    
    DriverProtocol: DriverProtocol,

    DriverDocuments: DriverDocuments,

    DriverProfile: DriverProfile,

    DriverSupport: DriverSupport,
    
    Drivers: Drivers,
    
    Orders: Orders,
    
    Search: Search,
    
    AIImport: AIImport,
    
    AVOAI: AVOAI,

    TeamAVO: TeamAVO,

    Terminal: Terminal,

    SystemVermietung: SystemVermietung,

    Verlauf: Verlauf,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const normalizedPath = location.pathname.toLowerCase();
    const isLoginRoute = normalizedPath === '/login' || normalizedPath.startsWith('/login/');
    const isResetRoute = normalizedPath === '/reset-password';
    const isSetPasswordRoute = normalizedPath === '/set-password';
    const isDriverAccessRoute = normalizedPath === '/driver';
    const currentPage = _getCurrentPage(location.pathname);
    const [currentUser, setCurrentUser] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
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
    }, [normalizedPath]);

    if (!authChecked) {
        return null;
    }

    if (isLoginRoute || isResetRoute || isSetPasswordRoute || isDriverAccessRoute) {
        return (
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/login/driver" element={<LoginDriver />} />
                <Route path="/login/staff" element={<LoginStaff />} />
                <Route path="/login/executive" element={<LoginExecutive />} />
                <Route path="/driver" element={<DriverAccess />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/set-password" element={<SetPassword />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    const driverAllowedPages = [
        'DriverOrders',
        'DriverChecklist',
        'DriverProtocol',
        'DriverDocuments',
        'DriverProfile',
        'DriverSupport',
    ];

    if (currentUser.role === 'driver' && !driverAllowedPages.includes(currentPage)) {
        return <Navigate to={createPageUrl('DriverOrders')} replace />;
    }

    if (!hasPageAccess(currentUser, currentPage)) {
        return (
            <Layout currentPageName={currentPage}>
                <AccessDenied />
            </Layout>
        );
    }
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Navigate to={createPageUrl('Dashboard')} replace />} />
                
                
                <Route path="/AppConnection" element={<AppConnection />} />
                
                <Route path="/Checklists" element={<Checklists />} />
                
                <Route path="/Customers" element={<Customers />} />
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/DriverChecklist" element={<DriverChecklist />} />
                
                <Route path="/DriverOrders" element={<DriverOrders />} />
                
                <Route path="/DriverProtocol" element={<DriverProtocol />} />

                <Route path="/DriverDocuments" element={<DriverDocuments />} />

                <Route path="/DriverProfile" element={<DriverProfile />} />

                <Route path="/DriverSupport" element={<DriverSupport />} />
                
                <Route path="/Drivers" element={<Drivers />} />
                
                <Route path="/Orders" element={<Orders />} />
                
                <Route path="/Search" element={<Search />} />
                
                <Route path="/AIImport" element={<AIImport />} />
                
                <Route path="/AVOAI" element={<AVOAI />} />

                <Route path="/TeamAVO" element={<TeamAVO />} />

                <Route path="/Terminal" element={<Terminal />} />

                <Route path="/SystemVermietung" element={<SystemVermietung />} />

                <Route path="/verlauf" element={<Verlauf />} />
                
            </Routes>
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
