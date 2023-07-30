import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt } from 'azle';
import { v4 as uuidv4 } from 'uuid';

// Define the data types for the configuration, stage transitions, and Kanban cards

// Configuration type to store the initial stage for Kanban cards
type Configuration = Record<{
    initialStage: string,
}>

// StageTransition type to represent a stage transition configuration
type StageTransition = Record<{
    id: string;
    stage_from: string;
    stage_to: string;
    createdAt: nat64;
    updatedAt: Opt<nat64>;
}>

// Payload type to add or update a stage transition
type StageTransitionPayload = Record<{
    stage_from: string;
    stage_to: string;
}>

// KanbanCard type to represent a single Kanban card
type KanbanCard = Record<{
    id: string;
    description: string;
    assignee: string;
    deadline: nat64;
    stage: string;
    createdAt: nat64;
    updatedAt: Opt<nat64>;
}>

// Payload type to add or update a Kanban card
type KanbanCardPayload = Record<{
    description: string;
    assignee: string;
    deadline: nat64;
}>


// Configuration and data storage variables

// Initialize the configuration with the default initial stage "Requested"
var configuration: Configuration = {
    initialStage: "Requested"
};

// Data storage for disallowed stage transitions configuration using a BTree map
const disallowedStageTransitionsConfig = new StableBTreeMap<string, StageTransition>(0, 44, 512);

// Data storage for Kanban cards using a BTree map
const kanbanCardsStorage = new StableBTreeMap<string, KanbanCard>(1, 44, 1024);


// Configuration functions

// Function to set the configuration with a new initial stage
$update;
export function setConfiguration(payload: Configuration): Result<Configuration, string> {
    // Prevent updating the configuration if there are existing Kanban Cards
    if (kanbanCardsStorage.len() > 0)
        return Result.Err<Configuration, string>(`Couldn't update Configuration. There is at least one Kanban Card.`);

    // Prevent updating the configuration with an empty initial stage
    if (payload.initialStage.trim().length == 0)
        return Result.Err<Configuration, string>(`Couldn't update Configuration. InitialStage can't be empty.`);

    // Update the configuration with the new payload
    configuration = payload;

    return Result.Ok(configuration);
}

// Function to get the current configuration
$query;
export function getConfiguration(): Result<Configuration, string> {
    return Result.Ok(configuration);
}


// Disallowed stage transitions functions

// Function to add a new disallowed stage transition configuration
$update;
export function addDisallowedStageTransition(payload: StageTransitionPayload): Result<StageTransition, string> {
    // Create a new stage transition object with a unique ID and timestamp
    const stageTransition: StageTransition = {
        id: uuidv4(),
        createdAt: ic.time(),
        updatedAt: Opt.None,
        stage_from: payload.stage_from,
        stage_to: payload.stage_to,
    };

    // Insert the new stage transition into the configuration storage
    disallowedStageTransitionsConfig.insert(stageTransition.id, stageTransition);

    return Result.Ok(stageTransition);
}

// Function to update an existing disallowed stage transition configuration
$update;
export function updateDisallowedStageTransition(id: string, payload: StageTransitionPayload): Result<StageTransition, string> {
    return match(disallowedStageTransitionsConfig.get(id), {
        Some: (stageTransition) => {
            // Update the existing stage transition with the new payload and set the update timestamp
            const stageTransitionToUpdate: StageTransition = {...stageTransition, ...payload, updatedAt: Opt.Some(ic.time())};
            disallowedStageTransitionsConfig.insert(stageTransition.id, stageTransitionToUpdate);
            return Result.Ok<StageTransition, string>(stageTransitionToUpdate);
        },
        None: () => Result.Err<StageTransition, string>(`Couldn't update Stage transition with id=${id}. Stage transition not found.`)
    });
}

// Function to delete a disallowed stage transition configuration
$update;
export function deleteDisallowedStageTransition(id: string): Result<StageTransition, string> {
    return match(disallowedStageTransitionsConfig.remove(id), {
        Some: (deletedStageTransition) => Result.Ok<StageTransition, string>(deletedStageTransition),
        None: () => Result.Err<StageTransition, string>(`Couldn't delete Stage transition with id=${id}. Stage transition not found.`)
    });
}

// Function to get a specific disallowed stage transition configuration by ID
$query;
export function getDisallowedStageTransition(id: string): Result<StageTransition, string> {
    return match(disallowedStageTransitionsConfig.get(id), {
        Some: (stageTransition) => Result.Ok<StageTransition, string>(stageTransition),
        None: () => Result.Err<StageTransition, string>(`Couldn't get Stage transition with id=${id}. Stage transition not found`)
    });
}

// Function to get all disallowed stage transition configurations
$query;
export function getDisallowedStageTransitions(): Result<Vec<StageTransition>, string> {
    return Result.Ok(disallowedStageTransitionsConfig.values());
}


// Kanban cards functions

// Function to add a new Kanban card
$update;
export function addKanbanCard(payload: KanbanCardPayload): Result<KanbanCard, string> {
    // Validate the Kanban card description before adding
    if (!isValidDescription(payload.description))
        return Result.Err<KanbanCard, string>(`Couldn't add Kanban Card. Description is invalid`);

    // Create a new Kanban card object with a unique ID, timestamp, and default stage
    const kanbanCardToAdd: KanbanCard = {
        id: uuidv4(),
        createdAt: ic.time(),
        updatedAt: Opt.None,

        description: payload.description,
        assignee: payload.assignee,
        deadline: payload.deadline,
        stage: configuration.initialStage,
    };

    // Insert the new Kanban card into the storage
    kanbanCardsStorage.insert(kanbanCardToAdd.id, kanbanCardToAdd);

    return Result.Ok(kanbanCardToAdd);
}

// Function to update an existing Kanban card
$update;
export function updateKanbanCard(id: string, payload: KanbanCardPayload): Result<KanbanCard, string> {
    // Validate the Kanban card description before updating
    if (!isValidDescription(payload.description))
        return Result.Err<KanbanCard, string>(`Couldn't update Kanban Card. Description is invalid`);

    return match(kanbanCardsStorage.get(id), {
        Some: (kanbanCard) => {
            // Update the existing Kanban card with the new payload and set the update timestamp
            const kanbanCardToUpdate: KanbanCard = {...kanbanCard, ...payload, updatedAt: Opt.Some(ic.time())};
            kanbanCardsStorage.insert(kanbanCard.id, kanbanCardToUpdate);
            return Result.Ok<KanbanCard, string>(kanbanCardToUpdate);
        },
        None: () =>
