import { BackIcon } from "./Icons.jsx";

export default function ProjectsPlaceholder({ onReturn }) {
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
      <article className="project-placeholder-card">
        <p className="project-card-label">Placeholder project</p>
        <h2>Your next useful thing</h2>
        <p>Projects you create will appear here.</p>
      </article>
    </section>
  );
}
