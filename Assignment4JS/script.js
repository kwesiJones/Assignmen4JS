(function () {
  "use strict";

  // Make sure notifications are hidden when the page loads
  document.addEventListener("DOMContentLoaded", function () {
    const notif = document.getElementById("notification");
    if (notif) {
      notif.classList.remove("show");
      notif.style.display = "none";
      notif.textContent = "";
    }
  });

  // App settings and options
  const CONSTANTS = {
    NOTIFICATION_DURATION: 3000,
    ERROR_NOTIFICATION_DURATION: 5000,
    MAX_TITLE_LENGTH: 100,
    MAX_DESCRIPTION_LENGTH: 500,
    MIN_TITLE_LENGTH: 3,
    STORAGE_KEY: "taskManagerTasks",
    THEME_KEY: "taskManagerTheme",
    DEBOUNCE_DELAY: 300,
    PRIORITY_ORDER: { high: 3, medium: 2, low: 1 },
    PRIORITIES: ["low", "medium", "high"],
    CATEGORIES: ["personal", "work", "urgent"],
  };

  // Handy tools for text, validation, and IDs
  const Utils = {
    sanitizeText(text) {
      if (typeof text !== "string") return "";
      return text.trim().replace(/[<>]/g, "");
    },
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },
    generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
    debounce(func, wait) {
      let timeout;
      return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    },
    validateLength(text, min, max) {
      const length = text.trim().length;
      return length >= min && length <= max;
    },
    validateEnum(value, allowed) {
      return allowed.includes(value);
    },
  };

  // Represents a single task
  class Task {
    constructor(title, description, priority, category) {
      this.id = Utils.generateId();
      this.title = Utils.sanitizeText(title);
      this.description = Utils.sanitizeText(description);
      this.priority = priority;
      this.category = category;
      this.completed = false;
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
    markComplete() {
      this.completed = true;
      this.updatedAt = new Date();
    }
    markIncomplete() {
      this.completed = false;
      this.updatedAt = new Date();
    }
    update(title, description, priority, category) {
      this.title = Utils.sanitizeText(title);
      this.description = Utils.sanitizeText(description);
      this.priority = priority;
      this.category = category;
      this.updatedAt = new Date();
    }
    matchesSearch(query) {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        this.title.toLowerCase().includes(q) ||
        this.description.toLowerCase().includes(q)
      );
    }
    static validate(title, description, priority, category) {
      const errors = {};
      if (!title || !title.trim()) {
        errors.title = "Task title is required";
      } else if (
        !Utils.validateLength(
          title,
          CONSTANTS.MIN_TITLE_LENGTH,
          CONSTANTS.MAX_TITLE_LENGTH
        )
      ) {
        errors.title = `Title must be ${CONSTANTS.MIN_TITLE_LENGTH}-${CONSTANTS.MAX_TITLE_LENGTH} chars`;
      }
      if (
        description &&
        !Utils.validateLength(description, 0, CONSTANTS.MAX_DESCRIPTION_LENGTH)
      ) {
        errors.description = `Description max ${CONSTANTS.MAX_DESCRIPTION_LENGTH} chars`;
      }
      if (!priority || !Utils.validateEnum(priority, CONSTANTS.PRIORITIES)) {
        errors.priority = "Please select a valid priority";
      }
      if (!category || !Utils.validateEnum(category, CONSTANTS.CATEGORIES)) {
        errors.category = "Please select a valid category";
      }
      return { isValid: Object.keys(errors).length === 0, errors };
    }
  }

  // Handles showing and hiding notifications
  class NotificationManager {
    constructor() {
      this.element = document.getElementById("notification");
      this.announcements = document.getElementById("announcements");
      this.currentTimeout = null;
    }
    show(message, type = "success") {
      if (!this.element) return;
      if (this.currentTimeout) clearTimeout(this.currentTimeout);

      this.element.style.display = "block";
      this.element.textContent = message;
      this.element.className = `notification ${type}`;
      if (this.announcements) this.announcements.textContent = message;

      setTimeout(() => this.element.classList.add("show"), 10);

      const duration = type === "error" ? 5000 : 3000;
      this.currentTimeout = setTimeout(() => this.hide(), duration);
    }
    hide() {
      if (!this.element) return;
      this.element.classList.remove("show");
      setTimeout(() => {
        this.element.style.display = "none";
        this.element.textContent = "";
      }, 300);
    }
    clear() {
      this.hide();
    }
  }

  // Deals with saving and loading tasks in localStorage
  class StorageManager {
    static save(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        return { success: true };
      } catch (e) {
        return { success: false, error: "Storage error" };
      }
    }
    static load(key) {
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      } catch {
        return null;
      }
    }
    static remove(key) {
      try {
        localStorage.removeItem(key);
        return { success: true };
      } catch {
        return { success: false, error: "Remove error" };
      }
    }
  }

  // The main app logic lives here
  class TaskManager {
    constructor() {
      this.tasks = [];
      this.currentEditId = null;
      this.filteredTasks = [];
      this.notifications = new NotificationManager();
      this.isSubmitting = false;

      this.init();
    }

    init() {
      this.loadTasks();
      this.initializeEventListeners();
      this.setupFormEnhancements();
      this.loadTheme();
      this.renderTasks();
      this.addDemoTasks();
    }

    setupFormEnhancements() {
      // Live feedback for the title field
      const titleInput = document.getElementById("taskTitle");
      if (titleInput) {
        titleInput.addEventListener("input", (e) => {
          const value = e.target.value.trim();
          const titleError = document.getElementById("titleError");
          titleInput.classList.remove("valid", "invalid");
          if (titleError) titleError.textContent = "";
          if (value.length === 0) return;
          else if (value.length < CONSTANTS.MIN_TITLE_LENGTH) {
            titleInput.classList.add("invalid");
            if (titleError)
              titleError.textContent = `At least ${CONSTANTS.MIN_TITLE_LENGTH} chars`;
          } else if (value.length > CONSTANTS.MAX_TITLE_LENGTH) {
            titleInput.classList.add("invalid");
            if (titleError)
              titleError.textContent = `Max ${CONSTANTS.MAX_TITLE_LENGTH} chars`;
          } else {
            titleInput.classList.add("valid");
          }
        });
        // Show how many characters are left
        let counter = document.getElementById("titleCharCounter");
        if (!counter) {
          counter = document.createElement("div");
          counter.id = "titleCharCounter";
          counter.className = "char-counter";
          titleInput.parentNode.insertBefore(counter, titleInput.nextSibling);
        }
        const updateCounter = (e) => {
          const remaining = CONSTANTS.MAX_TITLE_LENGTH - e.target.value.length;
          counter.textContent = `${remaining} characters remaining`;
          counter.classList.remove("warning", "danger");
          if (remaining < 20 && remaining >= 0)
            counter.classList.add("warning");
          else if (remaining < 0) counter.classList.add("danger");
        };
        titleInput.addEventListener("input", updateCounter);
        updateCounter({ target: titleInput });
      }
    }

    setButtonLoading(isLoading) {
      const submitBtn = document.getElementById("submitBtn");
      const cancelBtn = document.getElementById("cancelBtn");
      if (submitBtn) {
        submitBtn.disabled = isLoading;
        submitBtn.classList.toggle("loading", isLoading);
        if (isLoading)
          submitBtn.innerHTML = '<span aria-hidden="true">⏳</span> Saving...';
        else if (this.currentEditId)
          submitBtn.innerHTML =
            '<span aria-hidden="true">💾</span> Update Task';
        else
          submitBtn.innerHTML = '<span aria-hidden="true">✅</span> Add Task';
      }
      if (cancelBtn) cancelBtn.disabled = isLoading;
    }

    async handleFormSubmit(e) {
      e.preventDefault();
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      this.setButtonLoading(true);

      // Grab the form values
      const title = document.getElementById("taskTitle").value.trim();
      const description = document
        .getElementById("taskDescription")
        .value.trim();
      const priority = document.getElementById("taskPriority").value;
      const category = document.getElementById("taskCategory").value;

      let result;
      if (this.currentEditId) {
        result = this.updateTask(
          this.currentEditId,
          title,
          description,
          priority,
          category
        );
        if (result.success) {
          this.notifications.show("Task updated successfully!");
          this.cancelEdit();
        }
      } else {
        result = this.addTask(title, description, priority, category);
        if (result.success) {
          this.notifications.show("Task added successfully! 🎉");
          this.resetFormWithAnimation();
        }
      }
      this.setButtonLoading(false);
      this.isSubmitting = false;
    }

    resetFormWithAnimation() {
      const form = document.getElementById("taskForm");
      if (!form) return;
      form.style.opacity = "0.6";
      form.style.transform = "scale(0.98)";
      setTimeout(() => {
        form.reset();
        document
          .querySelectorAll(".form-input, .form-select, .form-textarea")
          .forEach((el) => {
            el.classList.remove("valid", "invalid");
          });
        const counter = document.getElementById("titleCharCounter");
        if (counter) {
          counter.textContent = `${CONSTANTS.MAX_TITLE_LENGTH} characters remaining`;
          counter.classList.remove("warning", "danger");
        }
        this.clearValidationErrors();
        form.style.opacity = "1";
        form.style.transform = "scale(1)";
        const titleInput = document.getElementById("taskTitle");
        if (titleInput) titleInput.focus();
      }, 150);
    }

    addTask(title, description, priority, category) {
      const validation = Task.validate(title, description, priority, category);
      if (!validation.isValid) {
        this.displayValidationErrors(validation.errors);
        return { success: false, errors: validation.errors };
      }
      const task = new Task(title, description, priority, category);
      this.tasks.push(task);
      const saveResult = this.saveTasks();
      if (!saveResult.success) {
        this.tasks.pop();
        this.notifications.show(saveResult.error, "error");
        return { success: false, error: saveResult.error };
      }
      this.renderTasks();
      if (priority === "high")
        this.notifications.show(
          `High priority task "${task.title}" added!`,
          "warning"
        );
      return { success: true, task };
    }

    updateTask(id, title, description, priority, category) {
      const validation = Task.validate(title, description, priority, category);
      if (!validation.isValid) {
        this.displayValidationErrors(validation.errors);
        return { success: false, errors: validation.errors };
      }
      const taskIndex = this.tasks.findIndex((t) => t.id === id);
      if (taskIndex === -1) return { success: false, error: "Task not found" };
      const task = this.tasks[taskIndex];
      const wasHighPriority = task.priority === "high";
      task.update(title, description, priority, category);
      const saveResult = this.saveTasks();
      if (!saveResult.success) {
        this.notifications.show(saveResult.error, "error");
        return { success: false, error: saveResult.error };
      }
      this.renderTasks();
      if (priority === "high" && !wasHighPriority) {
        this.notifications.show(
          `Task "${task.title}" updated to high priority!`,
          "warning"
        );
      }
      return { success: true, task };
    }

    deleteTask(id) {
      const taskIndex = this.tasks.findIndex((t) => t.id === id);
      if (taskIndex === -1) return { success: false, error: "Task not found" };
      const task = this.tasks[taskIndex];
      this.tasks.splice(taskIndex, 1);
      const saveResult = this.saveTasks();
      if (!saveResult.success) {
        this.tasks.splice(taskIndex, 0, task);
        this.notifications.show(saveResult.error, "error");
        return { success: false, error: saveResult.error };
      }
      this.renderTasks();
      this.notifications.show(`Task "${task.title}" deleted!`);
      return { success: true };
    }

    // Fix for notification colors in toggleTaskCompletion method
// Replace your existing toggleTaskCompletion method with this:

toggleTaskCompletion(id) {
    try {
        const task = this.tasks.find(t => t.id === id);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.completed) {
            // Task is being marked as incomplete
            task.markIncomplete();
            this.notifications.show(`Task "${task.title}" marked incomplete`, 'error'); // RED notification
        } else {
            // Task is being marked as complete
            task.markComplete();
            this.notifications.show(`Task "${task.title}" completed!`, 'success'); // GREEN notification
        }

        const saveResult = this.saveTasks();
        if (!saveResult.success) {
            this.notifications.show(saveResult.error, 'error');
            return { success: false, error: saveResult.error };
        }

        this.renderTasks();
        return { success: true, task };
    } catch (error) {
        console.error('Toggle completion error:', error);
        this.notifications.show('Failed to update task status', 'error');
        return { success: false, error: 'Failed to update task status' };
    }
}

    getFilteredTasks() {
      const searchQuery = document.getElementById("searchInput").value;
      const categoryFilter = document.getElementById("categoryFilter").value;
      const priorityFilter = document.getElementById("priorityFilter").value;
      let filteredTasks = this.tasks.slice();
      if (searchQuery)
        filteredTasks = filteredTasks.filter((task) =>
          task.matchesSearch(searchQuery)
        );
      if (categoryFilter)
        filteredTasks = filteredTasks.filter(
          (task) => task.category === categoryFilter
        );
      if (priorityFilter)
        filteredTasks = filteredTasks.filter(
          (task) => task.priority === priorityFilter
        );
      filteredTasks.sort((a, b) => {
        const priorityDiff =
          CONSTANTS.PRIORITY_ORDER[b.priority] -
          CONSTANTS.PRIORITY_ORDER[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      return filteredTasks;
    }

    renderTasks() {
      const taskList = document.getElementById("taskList");
      const emptyState = document.getElementById("emptyState");
      const taskCount = document.getElementById("taskCount");
      if (!taskList || !emptyState || !taskCount) return;
      const filteredTasks = this.getFilteredTasks();
      this.filteredTasks = filteredTasks;
      this.updateTaskCount();
      if (filteredTasks.length === 0) {
        taskList.innerHTML = "";
        emptyState.style.display = "block";
        taskList.setAttribute("aria-label", "No tasks found");
        return;
      }
      emptyState.style.display = "none";
      taskList.setAttribute(
        "aria-label",
        `${filteredTasks.length} tasks found`
      );
      taskList.innerHTML = filteredTasks
        .map((task) => this.createTaskHTML(task))
        .join("");
    }

    createTaskHTML(task) {
      const priorityClass = `priority-${task.priority}`;
      const completedClass = task.completed ? "completed" : "";
      const completedText = task.completed
        ? "Mark Incomplete"
        : "Mark Complete";
      const completedIcon = task.completed ? "✅" : "⭕";
      return `
                <div class="task-item ${completedClass}" role="listitem" data-task-id="${
        task.id
      }">
                    <div class="task-header">
                        <h3 class="task-title">${Utils.escapeHtml(
                          task.title
                        )}</h3>
                        <div class="task-meta">
                            <span class="priority-badge ${priorityClass}" aria-label="${
        task.priority
      } priority">
                                ${task.priority.toUpperCase()}
                            </span>
                            <span class="category-badge" aria-label="Category: ${
                              task.category
                            }">
                                ${task.category.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    ${
                      task.description
                        ? `<p class="task-description">${Utils.escapeHtml(
                            task.description
                          )}</p>`
                        : ""
                    }
                    <div class="task-actions">
                        <button 
                            class="btn btn-success btn-sm" 
                            data-action="toggle-complete" 
                            data-task-id="${task.id}"
                            aria-label="${completedText} task: ${task.title}"
                        >
                            <span aria-hidden="true">${completedIcon}</span> ${completedText}
                        </button>
                        <button 
                            class="btn btn-primary btn-sm" 
                            data-action="edit" 
                            data-task-id="${task.id}"
                            aria-label="Edit task: ${task.title}"
                        >
                            <span aria-hidden="true">✏️</span> Edit
                        </button>
                        <button 
                            class="btn btn-danger btn-sm" 
                            data-action="delete" 
                            data-task-id="${task.id}"
                            aria-label="Delete task: ${task.title}"
                        >
                            <span aria-hidden="true">🗑️</span> Delete
                        </button>
                    </div>
                </div>
            `;
    }

    updateTaskCount() {
      const taskCount = document.getElementById("taskCount");
      if (!taskCount) return;
      const totalTasks = this.tasks.length;
      const completedTasks = this.tasks.filter((t) => t.completed).length;
      const filteredCount = this.filteredTasks.length;
      let countText = `${totalTasks} task${totalTasks !== 1 ? "s" : ""}`;
      if (completedTasks > 0) countText += ` (${completedTasks} completed)`;
      if (filteredCount !== totalTasks)
        countText = `${filteredCount} of ${countText} shown`;
      taskCount.textContent = countText;
    }

    editTask(id) {
      const task = this.tasks.find((t) => t.id === id);
      if (!task) {
        this.notifications.show("Task not found", "error");
        return;
      }
      this.currentEditId = id;
      document.getElementById("taskTitle").value = task.title;
      document.getElementById("taskDescription").value = task.description;
      document.getElementById("taskPriority").value = task.priority;
      document.getElementById("taskCategory").value = task.category;
      const counter = document.getElementById("titleCharCounter");
      if (counter) {
        const remaining = CONSTANTS.MAX_TITLE_LENGTH - task.title.length;
        counter.textContent = `${remaining} characters remaining`;
        counter.classList.remove("warning", "danger");
        if (remaining < 20 && remaining >= 0) counter.classList.add("warning");
        else if (remaining < 0) counter.classList.add("danger");
      }
      const titleInput = document.getElementById("taskTitle");
      if (titleInput) titleInput.dispatchEvent(new Event("input"));
      const formTitle = document.getElementById("form-title");
      const submitBtn = document.getElementById("submitBtn");
      const cancelBtn = document.getElementById("cancelBtn");
      if (formTitle) formTitle.textContent = "Edit Task";
      if (submitBtn)
        submitBtn.innerHTML = '<span aria-hidden="true">💾</span> Update Task';
      if (cancelBtn) cancelBtn.style.display = "inline-block";
      this.clearValidationErrors();
      const formSection = document.querySelector(".task-form-section");
      if (formSection) formSection.scrollIntoView({ behavior: "smooth" });
      if (titleInput) titleInput.focus();
    }

    cancelEdit() {
      this.currentEditId = null;
      this.resetFormWithAnimation();
      const formTitle = document.getElementById("form-title");
      const submitBtn = document.getElementById("submitBtn");
      const cancelBtn = document.getElementById("cancelBtn");
      if (formTitle) formTitle.textContent = "Add New Task";
      if (submitBtn)
        submitBtn.innerHTML = '<span aria-hidden="true">✅</span> Add Task';
      if (cancelBtn) cancelBtn.style.display = "none";
    }

    displayValidationErrors(errors) {
      this.clearValidationErrors();
      Object.entries(errors).forEach(([field, message]) => {
        const errorElement = document.getElementById(`${field}Error`);
        if (errorElement) errorElement.textContent = message;
      });
    }

    clearValidationErrors() {
      ["title", "priority", "category"].forEach((field) => {
        const errorElement = document.getElementById(`${field}Error`);
        if (errorElement) errorElement.textContent = "";
      });
    }

    saveTasks() {
      return StorageManager.save(CONSTANTS.STORAGE_KEY, this.tasks);
    }
    loadTasks() {
      const savedTasks = StorageManager.load(CONSTANTS.STORAGE_KEY);
      if (savedTasks && Array.isArray(savedTasks)) {
        this.tasks = savedTasks.map((data) => {
          const task = new Task(
            data.title,
            data.description,
            data.priority,
            data.category
          );
          task.id = data.id;
          task.completed = Boolean(data.completed);
          task.createdAt = new Date(data.createdAt);
          task.updatedAt = new Date(data.updatedAt);
          return task;
        });
      }
    }

    addDemoTasks() {
      // Add a friendly welcome task if none exist yet
      if (this.tasks.length === 0) {
        this.addTask(
          "Welcome to TASK CENTRAL!",
          "This is your first task. Try editing, marking as complete, or deleting it.",
          "medium",
          "personal"
        );
      }
    }

    initializeEventListeners() {
      // Handle form submits, button clicks, filters, and theme toggling
      const form = document.getElementById("taskForm");
      if (form) {
        form.addEventListener("submit", (e) => this.handleFormSubmit(e));
      }
      const cancelBtn = document.getElementById("cancelBtn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => this.cancelEdit());
      }
      document.addEventListener("click", (e) => {
        const action = e.target.dataset.action;
        const taskId = e.target.dataset.taskId;
        if (action && taskId) {
          e.preventDefault();
          if (action === "toggle-complete") this.toggleTaskCompletion(taskId);
          else if (action === "edit") this.editTask(taskId);
          else if (action === "delete") {
            if (confirm("Are you sure you want to delete this task?"))
              this.deleteTask(taskId);
          }
        }
      });
      const debouncedRender = Utils.debounce(
        () => this.renderTasks(),
        CONSTANTS.DEBOUNCE_DELAY
      );
      const searchInput = document.getElementById("searchInput");
      if (searchInput) searchInput.addEventListener("input", debouncedRender);
      const categoryFilter = document.getElementById("categoryFilter");
      if (categoryFilter)
        categoryFilter.addEventListener("change", () => this.renderTasks());
      const priorityFilter = document.getElementById("priorityFilter");
      if (priorityFilter)
        priorityFilter.addEventListener("change", () => this.renderTasks());
      const themeToggle = document.getElementById("themeToggle");
      if (themeToggle) {
        themeToggle.addEventListener("click", () => this.toggleTheme());
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.currentEditId) this.cancelEdit();
      });
    }

    toggleTheme() {
      // Switch between dark and light mode
      const body = document.body;
      const themeToggle = document.getElementById("themeToggle");
      const currentTheme = body.getAttribute("data-theme");
      if (currentTheme === "dark") {
        body.setAttribute("data-theme", "light");
        if (themeToggle)
          themeToggle.innerHTML =
            '<span aria-hidden="true">🌙</span> Dark Mode';
        StorageManager.save(CONSTANTS.THEME_KEY, "light");
      } else {
        body.setAttribute("data-theme", "dark");
        if (themeToggle)
          themeToggle.innerHTML =
            '<span aria-hidden="true">☀️</span> Light Mode';
        StorageManager.save(CONSTANTS.THEME_KEY, "dark");
      }
    }

    loadTheme() {
      const savedTheme = StorageManager.load(CONSTANTS.THEME_KEY) || "light";
      const body = document.body;
      const themeToggle = document.getElementById("themeToggle");
      body.setAttribute("data-theme", savedTheme);
      if (themeToggle) {
        if (savedTheme === "dark")
          themeToggle.innerHTML =
            '<span aria-hidden="true">☀️</span> Light Mode';
        else
          themeToggle.innerHTML =
            '<span aria-hidden="true">🌙</span> Dark Mode';
      }
    }
  }

  // To Load the app once the page is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new TaskManager());
  } else {
    new TaskManager();
  }
})();
