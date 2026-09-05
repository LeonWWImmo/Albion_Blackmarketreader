import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const LandingPage = lazy(() => import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("./features/dashboard").then((m) => ({ default: m.DashboardPage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage").then((m) => ({ default: m.CommunityPage })));
const LegalPage = lazy(() => import("./pages/LegalPage").then((m) => ({ default: m.LegalPage })));
const GuidesIndexPage = lazy(() => import("./pages/GuidesIndexPage").then((m) => ({ default: m.GuidesIndexPage })));
const GuidePage = lazy(() => import("./pages/GuidePage").then((m) => ({ default: m.GuidePage })));
const CraftingCalculatorPage = lazy(() =>
  import("./features/crafting-calculator").then((m) => ({ default: m.CraftingCalculatorPage }))
);
const BmCrafterPage = lazy(() => import("./features/bm-crafter").then((m) => ({ default: m.BmCrafterPage })));
const RefiningCalculatorPage = lazy(() =>
  import("./features/refining-calculator").then((m) => ({ default: m.RefiningCalculatorPage }))
);
const FoodPotionCrafterPage = lazy(() =>
  import("./features/food-potion-crafter").then((m) => ({ default: m.FoodPotionCrafterPage }))
);

export function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/guides" element={<GuidesIndexPage />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
        <Route path="/bm-crafter" element={<BmCrafterPage />} />
        <Route path="/crafting-calculator" element={<CraftingCalculatorPage />} />
        <Route path="/refining-calculator" element={<RefiningCalculatorPage />} />
        <Route path="/food-potion-crafter" element={<FoodPotionCrafterPage />} />
        <Route path="/Blackmarket-Crafter" element={<Navigate to="/bm-crafter" replace />} />
        <Route path="/Blackmarket-Crafter/index.html" element={<Navigate to="/bm-crafter" replace />} />
        <Route path="/crafting-calculator/index.html" element={<Navigate to="/crafting-calculator" replace />} />
        <Route path="/Refining%20Calculator" element={<Navigate to="/refining-calculator" replace />} />
        <Route path="/Refining%20Calculator/index.html" element={<Navigate to="/refining-calculator" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
