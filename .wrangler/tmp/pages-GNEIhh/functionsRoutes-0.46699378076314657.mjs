import { onRequestGet as __api_projects__name__js_onRequestGet } from "/Users/macbook/Documents/Demo/integration-planner/functions/api/projects/[name].js"
import { onRequestOptions as __api_projects__name__js_onRequestOptions } from "/Users/macbook/Documents/Demo/integration-planner/functions/api/projects/[name].js"
import { onRequestPut as __api_projects__name__js_onRequestPut } from "/Users/macbook/Documents/Demo/integration-planner/functions/api/projects/[name].js"
import { onRequestGet as __api_projects_index_js_onRequestGet } from "/Users/macbook/Documents/Demo/integration-planner/functions/api/projects/index.js"
import { onRequestOptions as __api_projects_index_js_onRequestOptions } from "/Users/macbook/Documents/Demo/integration-planner/functions/api/projects/index.js"
import { onRequestPut as __api_projects_index_js_onRequestPut } from "/Users/macbook/Documents/Demo/integration-planner/functions/api/projects/index.js"

export const routes = [
    {
      routePath: "/api/projects/:name",
      mountPath: "/api/projects",
      method: "GET",
      middlewares: [],
      modules: [__api_projects__name__js_onRequestGet],
    },
  {
      routePath: "/api/projects/:name",
      mountPath: "/api/projects",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_projects__name__js_onRequestOptions],
    },
  {
      routePath: "/api/projects/:name",
      mountPath: "/api/projects",
      method: "PUT",
      middlewares: [],
      modules: [__api_projects__name__js_onRequestPut],
    },
  {
      routePath: "/api/projects",
      mountPath: "/api/projects",
      method: "GET",
      middlewares: [],
      modules: [__api_projects_index_js_onRequestGet],
    },
  {
      routePath: "/api/projects",
      mountPath: "/api/projects",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_projects_index_js_onRequestOptions],
    },
  {
      routePath: "/api/projects",
      mountPath: "/api/projects",
      method: "PUT",
      middlewares: [],
      modules: [__api_projects_index_js_onRequestPut],
    },
  ]