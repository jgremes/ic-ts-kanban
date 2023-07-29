import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt } from 'azle';
import { v4 as uuidv4 } from 'uuid';

type Configuration = Record<{
    initialStage: string,
}>

type StageTransition = Record<{
    id: string;
    stage_from: string;
    stage_to: string;
    createdAt: nat64;
    updatedAt: Opt<nat64>;
}>

type StageTransitionPayload = Record<{
    stage_from: string;
    stage_to: string;
}>

type KanbanCard = Record<{
    id: string;
    description: string;
    assignee: string;
    deadline: nat64,
    stage: string;
    createdAt: nat64;
    updatedAt: Opt<nat64>;
}>

type KanbanCardPayload = Record<{
    description: string;
    assignee: string;
    deadline: nat64,
}>


var configuration: Configuration = {
    initialStage: "Requested"
};

const disallowedStageTransitionsConfig = new StableBTreeMap<string, StageTransition>(0, 44, 512);

const kanbanCardsStorage = new StableBTreeMap<string, KanbanCard>(1, 44, 1024);


// Configuration
$update;
export function setConfiguration(payload: Configuration): Result<Configuration, string> {
    if(kanbanCardsStorage.len() > 0)
        return Result.Err<Configuration, string>(`Couldn't update Configuration. There is at least one Kanban Card.`);

    if(payload.initialStage.trim().length == 0)
        return Result.Err<Configuration, string>(`Couldn't update Configuration. InitialStage can't be empty.`);        

    configuration = payload;        

    return Result.Ok(configuration);
}

$query;
export function getConfiguration(): Result<Configuration, string> {
    return Result.Ok(configuration);
}

// Disallowed stage transitions configuration
$update;
export function addDisallowedStageTransition(payload: StageTransitionPayload): Result<StageTransition, string> {
    const stageTransition: StageTransition = { 
        id: uuidv4(), 
        createdAt: ic.time(), 
        updatedAt: Opt.None, 
        stage_from: payload.stage_from, 
        stage_to: payload.stage_to, 
    };

    disallowedStageTransitionsConfig.insert(stageTransition.id, stageTransition);

    return Result.Ok(stageTransition);
}    

$update;
export function updateDisallowedStageTransition(id: string, payload: StageTransitionPayload): Result<StageTransition, string> {
    return match(disallowedStageTransitionsConfig.get(id), {
        Some: (stageTransition) => {
            const stageTransitionToUpdate: StageTransition = {...stageTransition, ...payload, updatedAt: Opt.Some(ic.time())};
            disallowedStageTransitionsConfig.insert(stageTransition.id, stageTransitionToUpdate);
            return Result.Ok<StageTransition, string>(stageTransitionToUpdate);
        },
        None: () => Result.Err<StageTransition, string>(`Couldn't update Stage transition with id=${id}. Stage transition not found.`)
    });
}    

$update;
export function deleteDisallowedStageTransition(id: string): Result<StageTransition, string> {
    return match(disallowedStageTransitionsConfig.remove(id), {
        Some: (deletedStageTransition) => Result.Ok<StageTransition, string>(deletedStageTransition),
        None: () => Result.Err<StageTransition, string>(`Couldn't delete Stage transition with id=${id}. Stage transition not found.`)
    });
}

$query;
export function getDisallowedStageTransition(id: string): Result<StageTransition, string> {
    return match(disallowedStageTransitionsConfig.get(id), {
        Some: (stageTransition) => Result.Ok<StageTransition, string>(stageTransition),
        None: () => Result.Err<StageTransition, string>(`Couldn't get Stage transition with id=${id}. Stage transition not found`)
    });
}

$query;
export function getDisallowedStageTransitions(): Result<Vec<StageTransition>, string> {
    return Result.Ok(disallowedStageTransitionsConfig.values());
}


// Kanban cards
$update;
export function addKanbanCard(payload: KanbanCardPayload): Result<KanbanCard, string> {
    if( !isValidDescription(payload.description) ) 
        return Result.Err<KanbanCard, string>(`Couldn't add Kanban Card. Description is invalid`);
    
    const kanbanCardToAdd: KanbanCard = { 
        id: uuidv4(), 
        createdAt: ic.time(), 
        updatedAt: Opt.None, 
        
        description: payload.description,
        assignee: payload.assignee,
        deadline: payload.deadline,
        stage: configuration.initialStage,
    };

    kanbanCardsStorage.insert(kanbanCardToAdd.id, kanbanCardToAdd);

    return Result.Ok(kanbanCardToAdd);
}    

$update;
export function updateKanbanCard(id: string, payload: KanbanCardPayload): Result<KanbanCard, string> {
    if( !isValidDescription(payload.description) ) 
        return Result.Err<KanbanCard, string>(`Couldn't update Kanban Card. Description is invalid`);

    return match(kanbanCardsStorage.get(id), {
        Some: (kanbanCard) => {
            const kanbanCardToUpdate: KanbanCard = {...kanbanCard, ...payload, updatedAt: Opt.Some(ic.time())};
            kanbanCardsStorage.insert(kanbanCard.id, kanbanCardToUpdate);
            return Result.Ok<KanbanCard, string>(kanbanCardToUpdate);
        },
        None: () => Result.Err<KanbanCard, string>(`Couldn't update Kanban Card with id=${id}. Kanban Card not found.`)
    });
}

$update;
export function deleteKanbanCard(id: string): Result<KanbanCard, string> {
    return match(kanbanCardsStorage.remove(id), {
        Some: (deletedKanbanCard) => Result.Ok<KanbanCard, string>(deletedKanbanCard),
        None: () => Result.Err<KanbanCard, string>(`Couldn't delete Kanban Card with id=${id}. Kanban Card not found.`)
    });
}

$update;
export function updateKanbanCardStage(id: string, stage:string): Result<string, string> {
    return match(kanbanCardsStorage.get(id), {
        Some: (kanbanCard) => { 
            if (isValidStageTransition(kanbanCard.stage, stage)) {
                const kanbanCardToUpdate: KanbanCard = {...kanbanCard, stage: stage};

                kanbanCardsStorage.insert(kanbanCard.id, kanbanCardToUpdate);
                return Result.Ok<string, string>(stage) ;
            }
            else
                return Result.Err<string, string>(`Couldn't update Kanban Card with id=${id}. New stage is invalid.`);
        },
        None: () => Result.Err<string, string>(`Couldn't update Kanban Card with id=${id}. New stage is invalid.`)
    });
}


$query;
export function getKanbanCard(id: string): Result<KanbanCard, string> {
    return match(kanbanCardsStorage.get(id), {
        Some: (kanbanCard) => Result.Ok<KanbanCard, string>(kanbanCard),
        None: () => Result.Err<KanbanCard, string>(`Couldn't get Kanban Card with id=${id}. Kanban Card not found.`)
    });
}

$query;
export function getKanbanCards(): Result<Vec<KanbanCard>, string> {
    return Result.Ok(kanbanCardsStorage.values());
}

$query;
export function getKanbanCardsByAssignee(assignee: string): Result<Vec<KanbanCard>, string> {
    if( !isValidAssignee(assignee) ) 
        return Result.Err<Vec<KanbanCard>, string>(`Couldn't get Kanban Cards. Assignee is invalid.`);

    const filteredKanbanCards = kanbanCardsStorage.values().filter((kanbanCard) => {
        return (
            kanbanCard.assignee == assignee
        );
    });
    return Result.Ok(filteredKanbanCards);
}

$query;
export function getKanbanCardsByStage(stage: string): Result<Vec<KanbanCard>, string> {
    if( !isValidStage(stage) ) 
        return Result.Err<Vec<KanbanCard>, string>(`Couldn't get Kanban Cards. Stage is invalid`);

    const filteredKanbanCards = kanbanCardsStorage.values().filter((kanbanCard) => {
        return (
            kanbanCard.stage == stage
        );
    });
    return Result.Ok(filteredKanbanCards);
}

function isValidDescription(description: string): boolean {
    return description.trim().length > 0;
}

function isValidAssignee(assignee: string): boolean {
    return assignee.trim().length > 0;
}

function isValidStage(stage: string): boolean {
    return stage.trim().length > 0;
}

function isValidStageTransition(stage_from: string, stage_to: string): boolean {
    const filteredStageTransitions = disallowedStageTransitionsConfig.values().filter((stageTransition) => {
        return (
            stageTransition.stage_from == stage_from && stageTransition.stage_to == stage_to 
        );
    });

    return filteredStageTransitions.length == 0;
}


// a workaround to make uuid package work with Azle
globalThis.crypto = {
    //@ts-ignore
    getRandomValues: () => {
        let array = new Uint8Array(32);

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
        return array;
    }
};
