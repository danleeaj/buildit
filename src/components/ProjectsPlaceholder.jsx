import { BackIcon } from "./Icons.jsx";

export default function ProjectsPlaceholder({ onReturn, projects = [], error = "", onOpenProject }) {
  return (
    <section className="projects-placeholder" aria-labelledby="projects-title">
      <button type="button" className="projects-back" onClick={onReturn}>
        <BackIcon size={18} />
        <span>Return</span>
      </button>
      <div className="projects-heading">
        <p className="quiet-label">Your ideas, in progress</p>
        <h1 id="projects-title">Projects</h1>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {!error && projects.length === 0 && (
        <article className="project-placeholder-card">
          <p className="project-card-label">No saved projects yet</p>
          <h2>Your next useful thing</h2>
          <p>Projects you create will appear here.</p>
        </article>
      )}
      <div className="projects-list">
        {projects.map((project) => (
          <button className="project-placeholder-card project-open-card" type="button" key={project.id} onClick={() => onOpenProject?.(project.id)}>
            <p className="project-card-label">Saved project</p>
            <h2>{project.title}</h2>
            <p>{project.problem || "Open this project"}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
