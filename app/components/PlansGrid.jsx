import { PlanCard } from "./PlanCard";

export function PlansGrid({ 
  plans, 
  isCurrentPlan, 
  loadingPlan, 
  handleSubscribe, 
  getPlanRelation 
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "1.5rem",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {plans.map((plan) => {
        const isCurrent = isCurrentPlan(plan.planId);
        
        return (
          <PlanCard
            key={plan.name}
            plan={plan}
            isCurrent={isCurrent}
            loadingPlan={loadingPlan}
            onSubscribe={handleSubscribe}
            getPlanRelation={getPlanRelation}
          />
        );
      })}
    </div>
  );
}