import { routeConfig } from "@/shared/config/routeConfig/routeConfig";
import { Route, Routes } from "react-router";

export default function AppRouter() {
  return (
    <Routes>
      {Object.values(routeConfig).map((route) => (
        <Route path={route.path} element={route.element} />
      ))
      }
    </Routes>
  )
}