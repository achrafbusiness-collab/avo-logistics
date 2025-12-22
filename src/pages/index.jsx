import Layout from "./Layout.jsx";

import AppConnection from "./AppConnection";

import Checklists from "./Checklists";

import Customers from "./Customers";

import Dashboard from "./Dashboard";

import DriverChecklist from "./DriverChecklist";

import DriverOrders from "./DriverOrders";

import DriverProtocol from "./DriverProtocol";

import Drivers from "./Drivers";

import Orders from "./Orders";

import Search from "./Search";

import AIImport from "./AIImport";

import AVOAI from "./AVOAI";

import Login from "./Login";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { appClient } from '@/api/appClient';

const PAGES = {
    
    AppConnection: AppConnection,
    
    Checklists: Checklists,
    
    Customers: Customers,
    
    Dashboard: Dashboard,
    
    DriverChecklist: DriverChecklist,
    
    DriverOrders: DriverOrders,
    
    DriverProtocol: DriverProtocol,
    
    Drivers: Drivers,
    
    Orders: Orders,
    
    Search: Search,
    
    AIImport: AIImport,
    
    AVOAI: AVOAI,
    
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
    const isLoginRoute = location.pathname.toLowerCase() === '/login';
    const currentUser = appClient.auth.getCurrentUser();
    const currentPage = _getCurrentPage(location.pathname);

    if (isLoginRoute) {
        return (
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
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
                
                <Route path="/Drivers" element={<Drivers />} />
                
                <Route path="/Orders" element={<Orders />} />
                
                <Route path="/Search" element={<Search />} />
                
                <Route path="/AIImport" element={<AIImport />} />
                
                <Route path="/AVOAI" element={<AVOAI />} />
                
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
